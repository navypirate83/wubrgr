// =====================================================================
// CRASH REPORTS FOR THE APP (Android's half; part of the card text reader add-on)
// When the app closes by itself ("crashes") it normally leaves no trace the owner can read. This file does two things:
//   1. install(): puts a small watcher on the app's own code. If any part of the app's phone-side code
//      fails with an uncaught error, the watcher first writes the error's full "stack trace" (the list of steps that led
//      to it), the thread's name and the time into a file called last-crash.txt in the app's files folder (only
//      the latest is kept, and it is cut to a safe length), and THEN hands the error on to whatever was watching
//      before, so the app closes exactly as it always did.
//   2. report(): gives back text for the app to show or copy: that file, plus what Android itself recorded about
//      why the app's last few runs ended (Android 11 and newer keep such a record): the reason (CRASH, CRASH_NATIVE,
//      ANR = "not responding", LOW_MEMORY, ...), the signal number, the time, how important the app was, and how
//      much memory it used. For a "native" crash (a crash inside C or C++ code, which leaves no error message at all) Android
//      keeps a binary report; the readable words found inside it (the failed check, the signal, the names of the
//      libraries and functions) are pulled out and added, up to a few thousand characters.
// SAFETY: everything here is wrapped so that it can never throw: a watcher or a report that fails just does nothing.
// The first line of a report is "id=<number>" (the time of the newest serious event) so the app can show each one only once.
// =====================================================================

package expo.modules.cardtextreader

import android.annotation.TargetApi
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal object CrashReport {
  // The file the watcher writes (inside the app's own files folder)
  private const val FILE_NAME = "last-crash.txt"
  // The longest the file's text may be, in characters
  private const val MAX_FILE_CHARS = 8000
  // How much of Android's native crash report is looked through (bytes), and how much of its words are kept (characters)
  private const val MAX_TOMBSTONE_BYTES = 1_000_000
  private const val MAX_WORDS_CHARS = 6000
  // A run of printable characters must be at least this long to count as a word
  private const val MIN_RUN = 6
  // How many of Android's records of earlier runs are looked at
  private const val MAX_EXIT_ENTRIES = 3
  // "Important" levels: 100 = the app was in front, 200 = it was visible
  private const val VISIBLE_IMPORTANCE = 200

  // Has the watcher been put on already? (so it is never put on twice)
  @Volatile private var installed = false

  // Put the watcher on. "dir" is the app's files folder. Never throws.
  fun install(dir: File?) {
    try {
      if (installed || dir == null) return
      installed = true
      val previous = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, error ->
        // First save the details (if that fails, carry on)...
        try { write(dir, thread, error) } catch (ignored: Throwable) { }
        // ...then let the old watcher do what it always did (this is what closes the app)
        previous?.uncaughtException(thread, error)
      }
    } catch (ignored: Throwable) {
    }
  }

  // Write the error's details to the file, replacing any older one
  private fun write(dir: File, thread: Thread, error: Throwable) {
    val now = System.currentTimeMillis()
    val text = "time=" + now + "\nwhen=" + stamp(now) + "\nthread=" + thread.name + "\n" + error.stackTraceToString()
    File(dir, FILE_NAME).writeText(if (text.length > MAX_FILE_CHARS) text.substring(0, MAX_FILE_CHARS) else text)
  }

  // A time as readable text in the world-wide clock
  private fun stamp(millis: Long): String {
    val format = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
    format.timeZone = TimeZone.getTimeZone("UTC")
    return format.format(Date(millis)) + " UTC"
  }

  // Forget the saved file. Never throws.
  fun clear(dir: File?) {
    try {
      if (dir != null) File(dir, FILE_NAME).delete()
    } catch (ignored: Throwable) {
    }
  }

  // The report text, or "" when there is nothing serious to report. Never throws.
  fun report(context: Context?, dir: File?): String {
    try {
      val body = StringBuilder()
      // The newest serious event's time (0 = none)
      var newest = 0L

      // 1. The file the watcher wrote
      if (dir != null) {
        val file = File(dir, FILE_NAME)
        if (file.exists()) {
          val text = file.readText()
          val time = Regex("^time=(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: file.lastModified()
          if (time > newest) newest = time
          body.append("== Error saved by the app ==\n").append(text).append("\n\n")
        }
      }

      // 2. What Android recorded (Android 11 and newer)
      if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val exits = StringBuilder()
        val time = exitSection(context, exits)
        if (time > newest) newest = time
        if (exits.isNotEmpty()) body.append("== Android's record of the last runs ==\n").append(exits)
      }

      if (newest == 0L) return ""
      return "id=" + newest + "\n" + body.toString()
    } catch (error: Throwable) {
      return ""
    }
  }

  // Describe the last few ends of the app as recorded by Android. Gives the time of the newest SERIOUS one (0 if none).
  @TargetApi(Build.VERSION_CODES.R)
  private fun exitSection(context: Context, out: StringBuilder): Long {
    var newest = 0L
    try {
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return 0L
      val list = manager.getHistoricalProcessExitReasons(context.packageName, 0, MAX_EXIT_ENTRIES) ?: return 0L
      // Only the first native crash gets its words pulled out
      var wordsDone = false
      for (info in list) {
        try {
          val reason = info.reason
          val serious = isSerious(reason, info.importance)
          if (serious && info.timestamp > newest) newest = info.timestamp
          out.append(reasonName(reason)).append(" (").append(reason).append(")")
            .append(" status/signal=").append(info.status)
            .append(" pid=").append(info.pid)
            .append(" process=").append(info.processName)
            .append(" time=").append(stamp(info.timestamp))
            .append(" importance=").append(info.importance)
            .append(" pss=").append(info.pss).append("KB")
            .append(" rss=").append(info.rss).append("KB")
            .append(" description=").append(info.description ?: "none")
            .append("\n")
          // A native crash: pull the readable words out of the binary report
          if (reason == 5 && !wordsDone) {
            wordsDone = true
            val words = readableWords(info.traceInputStream)
            if (words.isNotEmpty()) out.append("-- words found in the native crash report --\n").append(words).append("\n")
          }
        } catch (ignored: Throwable) {
          // one entry that can't be read must not stop the others
        }
      }
    } catch (ignored: Throwable) {
    }
    return newest
  }

  // Does this way of ending deserve to be shown to the person? Crashes, "not responding", and a failed start always do;
  // being killed (by the system, or for memory) only when the app was in front or visible (otherwise it is the phone
  // tidying up apps nobody was looking at, which is normal).
  private fun isSerious(reason: Int, importance: Int): Boolean = when (reason) {
    4, 5, 6, 7 -> true
    2, 3 -> importance <= VISIBLE_IMPORTANCE
    else -> false
  }

  // The names Android gives each reason (the numbers are fixed by Android: see ApplicationExitInfo.REASON_*)
  private fun reasonName(reason: Int): String = when (reason) {
    0 -> "UNKNOWN"
    1 -> "EXIT_SELF"
    2 -> "SIGNALED"
    3 -> "LOW_MEMORY"
    4 -> "CRASH"
    5 -> "CRASH_NATIVE"
    6 -> "ANR"
    7 -> "INITIALIZATION_FAILURE"
    8 -> "PERMISSION_CHANGE"
    9 -> "EXCESSIVE_RESOURCE_USAGE"
    10 -> "USER_REQUESTED"
    11 -> "USER_STOPPED"
    12 -> "DEPENDENCY_DIED"
    13 -> "OTHER"
    14 -> "FREEZER"
    15 -> "PACKAGE_STATE_CHANGE"
    16 -> "PACKAGE_UPDATED"
    else -> "REASON_" + reason
  }

  // The readable words inside a binary report: every run of at least MIN_RUN ordinary typed characters (letters,
  // digits, punctuation, spaces), one per line, cut to MAX_WORDS_CHARS. Always closes the stream.
  private fun readableWords(stream: InputStream?): String {
    if (stream == null) return ""
    try {
      val data = ByteArrayOutputStream()
      stream.use { input ->
        val buffer = ByteArray(8192)
        while (data.size() < MAX_TOMBSTONE_BYTES) {
          val count = input.read(buffer)
          if (count <= 0) break
          data.write(buffer, 0, count)
        }
      }
      val result = StringBuilder()
      val run = StringBuilder()
      for (b in data.toByteArray()) {
        val c = b.toInt() and 0xff
        if (c in 0x20..0x7e) {
          run.append(c.toChar())
        } else {
          if (run.length >= MIN_RUN) result.append(run.toString()).append("\n")
          run.setLength(0)
        }
        if (result.length >= MAX_WORDS_CHARS) break
      }
      if (run.length >= MIN_RUN && result.length < MAX_WORDS_CHARS) result.append(run.toString()).append("\n")
      return if (result.length > MAX_WORDS_CHARS) result.substring(0, MAX_WORDS_CHARS) else result.toString()
    } catch (error: Throwable) {
      return ""
    }
  }
}
