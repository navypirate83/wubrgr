// =====================================================================
// THE CARD TEXT READER (Android's half)
// The scanner screen takes a photo of a card and asks this add-on for things:
//   photoSize(path)        -> how big the photo is, turned the right way up (quick: the picture isn't opened)
//   readParts(...)         -> the text in each requested part of the card
//   grayCrops(...)         -> parts of the card as grey pictures (for telling older printings apart)
//   jpegCrop(...)          -> one part of the card as a small JPEG picture (to show on screen)
//   rgbCrops(...)          -> a part of the card as a COLOUR picture of a chosen size (red, green, blue bytes), for the AI
//   runModel(...)          -> run the AI model file (model.onnx) on one picture's numbers, with Microsoft's ONNX runtime
//                             (NEW, not yet tried on a phone: the app only calls it if it exists)
//   flattenCard(...)       -> a card found in the photo (four corners, can be tilted) cut out flat and upright as a new picture file
//                             (NEW, not yet tried on a phone: the app only calls it if it exists, so an older build is unaffected)
//   deletePhoto(path)      -> tidy up a photo the camera took
//   catalogueOpen / catalogueQuery / catalogueClose -> the card catalogue (a SQLite file), see CatalogueReader.kt
//   readStoredValue(key)   -> rescue a saved value too big for AsyncStorage's own reading, see CatalogueReader.kt
// Reading is done by Google's ML Kit, which runs on the phone itself (no
// internet needed). The photo is opened here, in the phone's own code, rather
// than sent through the app's JavaScript, because photos are big and this is much faster.
// SPEED: the photo is opened only once it is known where the card is, and only as big as
// reading needs (a huge photo is opened at half or quarter size), and it is NOT turned
// upright as a whole (that would copy every pixel): each small piece that is cut out is
// turned instead. The last photo opened is kept in memory, so asking for several
// things from the same photo only opens it once.
// SAFETY: every request catches ANY failure, including the phone running out of memory (OutOfMemoryError), and answers
// the app with an error message it can show, instead of letting the helper thread crash the whole app. A photo is
// never opened bigger than MAX_OPENED_PIXELS, and if even that runs out of memory it is opened at half that size.
// =====================================================================

package expo.modules.cardtextreader

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.ByteBuffer
import java.nio.ByteOrder
import android.media.ExifInterface
import android.util.Base64
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

// How wide the card should be when opened, in pixels, at the least. A photo that would still
// leave the card this wide after being halved (or quartered) is opened smaller, which is faster
// and uses much less memory.
private const val CARD_WIDTH_WANTED = 1700

// The most pixels a photo may have once opened (about 16 million: roughly 64 MB in memory). A bigger picture is
// opened smaller still, so a huge photo from the phone's gallery can't use up all the memory.
private const val MAX_OPENED_PIXELS = 16_000_000L

// The photo as opened: the picture itself (possibly shrunk), how many times it was shrunk,
// and how it must be turned to be upright (0, 90, 180 or 270 degrees)
private class OpenPhoto(val path: String, val picture: Bitmap?, val shrunkBy: Int, val turn: Int, val rawWidth: Int, val rawHeight: Int)

class CardTextReaderModule : Module() {
  // Google's reader, made the first time it's needed and kept after that
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  // One helper thread, so opening and reading photos never freezes the screen
  // (and two scans never run on top of each other)
  private val worker = Executors.newSingleThreadExecutor()

  // A second helper thread just for the card catalogue, so catalogue questions never wait behind a photo being read
  private val catalogueWorker = Executors.newSingleThreadExecutor()

  // The card catalogue, once opened
  private val catalogue = CatalogueReader()

  // A third one for rescuing saved values (reading a huge value can take a moment)
  private val storedWorker = Executors.newSingleThreadExecutor()

  // A helper thread for the AI model, so a picture being worked out never holds up the text reading
  private val modelWorker = Executors.newSingleThreadExecutor()

  // The AI model's runtime and the model opened from the file, made the first time they are needed and kept after that
  private var ortEnvironment: OrtEnvironment? = null
  private var ortSession: OrtSession? = null
  private var ortPath: String? = null

  // The photo most recently opened, kept for the next request
  private var open: OpenPhoto? = null

  // Let go of the kept photo (a picture takes a lot of the phone's memory)
  private fun forget() {
    open?.picture?.recycle()
    open = null
  }

  // Answer the app with an error instead of crashing. "error" can be anything that went wrong, even running out of
  // memory (which is not an Exception, so a plain "catch Exception" would let it through and close the app).
  // On running out of memory the kept photo is let go first, so the next request starts with more room.
  private fun fail(promise: Promise, code: String, fallback: String, error: Throwable) {
    val noMemory = error is OutOfMemoryError
    if (noMemory) {
      try { forget() } catch (ignored: Throwable) { /* nothing more to free */ }
    }
    val message = if (noMemory) "The phone ran out of memory reading the photo" else (error.message ?: fallback)
    promise.reject(CodedException(code, message, error))
  }

  // How the photo's file says it must be turned to be upright (phones usually save photos sideways),
  // and its size as stored. Reads only the file's small header, not the picture.
  private fun look(path: String): OpenPhoto {
    if (!File(path).exists()) throw IllegalStateException("The photo file is missing")
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IllegalStateException("The photo could not be opened")
    val turn = when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
    return OpenPhoto(path, null, 1, turn, bounds.outWidth, bounds.outHeight)
  }

  // The photo's size once it's upright: sideways photos swap width and height
  private fun uprightSize(photo: OpenPhoto): Pair<Int, Int> =
    if (photo.turn == 90 || photo.turn == 270) Pair(photo.rawHeight, photo.rawWidth) else Pair(photo.rawWidth, photo.rawHeight)

  // The photo opened as a picture, as small as is still good enough for this card. "card" is
  // where the card is in the photo (shares of the photo: left, top, width, height).
  private fun openFor(path: String, card: List<Double>): OpenPhoto {
    val seen = open?.takeIf { it.path == path } ?: look(path).also { forget(); open = it }
    // The card's width in the photo's own pixels, and how many times the photo can be shrunk and still
    // leave the card wide enough (only 1, 2, 4, 8 ... are possible)
    val cardWidth = card[2] * uprightSize(seen).first
    var shrink = 1
    while (cardWidth / (shrink * 2) >= CARD_WIDTH_WANTED) shrink *= 2
    // Never open more pixels than MAX_OPENED_PIXELS, whatever the card's size in the photo
    while (seen.rawWidth.toLong() / shrink * (seen.rawHeight.toLong() / shrink) > MAX_OPENED_PIXELS) shrink *= 2
    if (seen.picture != null && seen.shrunkBy == shrink) return seen
    seen.picture?.recycle()
    val picture = decode(path, shrink)
    val opened = OpenPhoto(path, picture, shrink, seen.turn, seen.rawWidth, seen.rawHeight)
    open = opened
    return opened
  }

  // The photo opened at one-in-"shrink" size. If the phone runs out of memory doing it, it is tried once more at half
  // that size (a smaller picture is better than a closed app); a second failure is passed on to the caller's "catch".
  private fun decode(path: String, shrink: Int): Bitmap {
    var picture: Bitmap? = null
    try {
      picture = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = shrink })
    } catch (noMemory: OutOfMemoryError) {
      picture = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = shrink * 2 })
    }
    return picture ?: throw IllegalStateException("The photo could not be opened")
  }

  // A box inside the card, as shares of the whole photo. "card" and "part" are both
  // (left, top, width, height); the part's numbers are shares of the card.
  private fun inPhoto(card: List<Double>, part: List<Double>): List<Double> = listOf(
    card[0] + part[0] * card[2],
    card[1] + part[1] * card[3],
    part[2] * card[2],
    part[3] * card[3],
  )

  // That box cut out of the photo and turned upright (never empty, never outside the picture).
  // The box is given as shares of the UPRIGHT photo, so it is first worked out where that is in the
  // photo as stored (sideways), cut out there, and only that small piece is turned.
  private fun cut(photo: OpenPhoto, box: List<Double>): Bitmap {
    val picture = photo.picture ?: throw IllegalStateException("The photo is not open")
    val u0 = box[0].coerceIn(0.0, 1.0)
    val v0 = box[1].coerceIn(0.0, 1.0)
    val u1 = (box[0] + box[2]).coerceIn(0.0, 1.0)
    val v1 = (box[1] + box[3]).coerceIn(0.0, 1.0)
    // The same box in the stored photo, as shares (left, top, right, bottom)
    val shares = when (photo.turn) {
      90 -> listOf(v0, 1 - u1, v1, 1 - u0)
      180 -> listOf(1 - u1, 1 - v1, 1 - u0, 1 - v0)
      270 -> listOf(1 - v1, u0, 1 - v0, u1)
      else -> listOf(u0, v0, u1, v1)
    }
    val left = (shares[0] * picture.width).toInt().coerceIn(0, picture.width - 1)
    val top = (shares[1] * picture.height).toInt().coerceIn(0, picture.height - 1)
    val width = ((shares[2] - shares[0]) * picture.width).toInt().coerceIn(1, picture.width - left)
    val height = ((shares[3] - shares[1]) * picture.height).toInt().coerceIn(1, picture.height - top)
    val piece = Bitmap.createBitmap(picture, left, top, width, height)
    if (photo.turn == 0) return piece
    val turned = Bitmap.createBitmap(piece, 0, 0, piece.width, piece.height, Matrix().apply { postRotate(photo.turn.toFloat()) }, true)
    if (turned !== piece) piece.recycle()
    return turned
  }

  // The text in one box of the picture
  private fun readBox(photo: OpenPhoto, box: List<Double>): String {
    var piece = cut(photo, box)
    // Only a narrow piece (a card held far away) is blown up to read better, never more than twice;
    // a piece that is already wide enough is read as it is, which is much quicker
    if (piece.width < 500) {
      val grow = minOf(2.0, 500.0 / piece.width)
      val bigger = Bitmap.createScaledBitmap(piece, (piece.width * grow).toInt(), (piece.height * grow).toInt(), true)
      if (bigger !== piece) piece.recycle()
      piece = bigger
    }
    // Wait here for Google's answer (fine: this runs on our helper thread, not the screen's). The piece is let go
    // afterwards even if the reader fails, so a failure doesn't leave pictures piling up in memory.
    try {
      val result = Tasks.await(recognizer.process(InputImage.fromBitmap(piece, 0)))
      return result.text.trim()
    } finally {
      piece.recycle()
    }
  }

  // One box as a grey picture no wider than "maxWidth": its size, and one number from 0 to 255 for
  // each pixel (row by row), packed as text. Uses the same brightness sum as the website's reader.
  private fun grayBox(photo: OpenPhoto, box: List<Double>, maxWidth: Int): Map<String, Any> {
    val piece = cut(photo, box)
    val width = minOf(maxWidth, piece.width)
    val height = maxOf(1, Math.round(width.toDouble() * piece.height / piece.width).toInt())
    val small = Bitmap.createScaledBitmap(piece, width, height, true)
    if (small !== piece) piece.recycle()
    val pixels = IntArray(width * height)
    small.getPixels(pixels, 0, width, 0, 0, width, height)
    small.recycle()
    val gray = ByteArray(pixels.size)
    for (i in pixels.indices) {
      val p = pixels[i]
      val red = (p shr 16) and 0xff
      val green = (p shr 8) and 0xff
      val blue = p and 0xff
      gray[i] = Math.round(0.299 * red + 0.587 * green + 0.114 * blue).toInt().toByte()
    }
    return mapOf("width" to width, "height" to height, "data" to Base64.encodeToString(gray, Base64.NO_WRAP))
  }

  // One box as a COLOUR picture exactly "width" x "height": the size and the pixels (red, green, blue, one byte each, row by row),
  // packed as text. (The AI needs colour; grayBox above is for the clues that do not.)
  private fun rgbBox(photo: OpenPhoto, box: List<Double>, width: Int, height: Int): Map<String, Any> {
    val piece = cut(photo, box)
    val small = Bitmap.createScaledBitmap(piece, width, height, true)
    if (small !== piece) piece.recycle()
    val pixels = IntArray(width * height)
    small.getPixels(pixels, 0, width, 0, 0, width, height)
    small.recycle()
    val rgb = ByteArray(pixels.size * 3)
    for (i in pixels.indices) {
      val p = pixels[i]
      rgb[i * 3] = ((p shr 16) and 0xff).toByte()
      rgb[i * 3 + 1] = ((p shr 8) and 0xff).toByte()
      rgb[i * 3 + 2] = (p and 0xff).toByte()
    }
    return mapOf("width" to width, "height" to height, "data" to Base64.encodeToString(rgb, Base64.NO_WRAP))
  }

  // Answer the app with an error for the catalogue and saved-value requests (any failure, even running out of memory)
  private fun reject(promise: Promise, code: String, fallback: String, error: Throwable) {
    val message = if (error is OutOfMemoryError) "The phone ran out of memory" else (error.message ?: fallback)
    promise.reject(CodedException(code, message, error))
  }

  override fun definition() = ModuleDefinition {
    // The name the app's JavaScript uses to find this add-on
    Name("CardTextReader")

    // Runs when the app starts (Expo calls every add-on's OnCreate as the app's JavaScript engine is set up, not on first use):
    // puts the crash watcher on (see CrashReport.kt). It can never stop the app starting: any failure is ignored.
    OnCreate {
      try { CrashReport.install(appContext.persistentFilesDirectory) } catch (ignored: Throwable) { /* no watcher then */ }
    }

    // The text of the last crash report ("" if there is none; the first line is "id=<number>"). NEW: older builds don't have it,
    // so the app's JavaScript only calls it if it exists.
    AsyncFunction("lastCrashReport") { promise: Promise ->
      Thread {
        try {
          promise.resolve(CrashReport.report(appContext.reactContext, appContext.persistentFilesDirectory))
        } catch (error: Throwable) {
          promise.resolve("")
        }
      }.start()
    }

    // Forget the saved crash file (Android's own record of earlier runs can't be erased; the app remembers what it has shown)
    AsyncFunction("clearCrashReport") { promise: Promise ->
      try { CrashReport.clear(appContext.persistentFilesDirectory) } catch (ignored: Throwable) { /* nothing to clear */ }
      promise.resolve(null)
    }

    // How big the photo is once it's upright: [width, height]. Only the file's header is read.
    AsyncFunction("photoSize") { path: String, promise: Promise ->
      worker.execute {
        try {
          val photo = open?.takeIf { it.path == path } ?: look(path).also { forget(); open = it }
          val (width, height) = uprightSize(photo)
          promise.resolve(listOf(width, height))
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_PHOTO", "The photo could not be read", error)
        }
      }
    }

    // The text in each part of the card. "card" is where the card is in the photo and "parts" are the
    // boxes to read (each given as shares of the CARD: left, top, width, height). Gives back one piece of text
    // per part, in the same order.
    AsyncFunction("readParts") { path: String, card: List<Double>, parts: List<List<Double>>, promise: Promise ->
      worker.execute {
        try {
          val photo = openFor(path, card)
          promise.resolve(parts.map { readBox(photo, inPhoto(card, it)) })
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_TEXT", "The card could not be read", error)
        }
      }
    }

    // Parts of the card as grey pictures (same box shape as readParts), each no wider than its
    // number in "maxWidths". Each answer has a width, a height and the pixels packed as text.
    AsyncFunction("grayCrops") { path: String, card: List<Double>, parts: List<List<Double>>, maxWidths: List<Int>, promise: Promise ->
      worker.execute {
        try {
          val photo = openFor(path, card)
          promise.resolve(parts.mapIndexed { index, part -> grayBox(photo, inPhoto(card, part), maxWidths[index]) })
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_CROP", "The card could not be cropped", error)
        }
      }
    }

    // One part of the card as a small JPEG picture, packed as text (to show on the screen)
    AsyncFunction("jpegCrop") { path: String, card: List<Double>, part: List<Double>, width: Int, promise: Promise ->
      worker.execute {
        try {
          val photo = openFor(path, card)
          val piece = cut(photo, inPhoto(card, part))
          val size = minOf(width, piece.width)
          val small = Bitmap.createScaledBitmap(piece, size, maxOf(1, Math.round(size.toDouble() * piece.height / piece.width).toInt()), true)
          if (small !== piece) piece.recycle()
          val bytes = ByteArrayOutputStream()
          small.compress(Bitmap.CompressFormat.JPEG, 80, bytes)
          small.recycle()
          promise.resolve(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_CROP", "The card could not be cropped", error)
        }
      }
    }

    // Parts of the card as COLOUR pictures (same box shape as readParts), each exactly its own width x height. Each answer has the
    // width, the height and the pixels (red, green, blue per pixel) packed as text. Used by the AI art matching.
    // (NEW, not yet tried on a phone: the app only calls it if it exists.)
    AsyncFunction("rgbCrops") { path: String, card: List<Double>, parts: List<List<Double>>, widths: List<Int>, heights: List<Int>, promise: Promise ->
      worker.execute {
        try {
          val photo = openFor(path, card)
          promise.resolve(parts.mapIndexed { index, part -> rgbBox(photo, inPhoto(card, part), widths[index], heights[index]) })
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_CROP", "The card could not be cropped", error)
        }
      }
    }

    // Run the AI model (the ONNX file at "modelPath") on one picture's numbers: "tensorBase64" is 3 x 224 x 224 decimals (4 bytes each,
    // little-endian) as base64 text. Gives back the model's raw answer: its shape (like [1, 257, 768]) and its decimals as base64 text.
    // The model is opened the first time and kept for the next picture.
    // (NEW, not yet tried on a phone: the app's JavaScript only calls it if it exists, so an older build is unaffected.)
    AsyncFunction("runModel") { modelPath: String, tensorBase64: String, promise: Promise ->
      modelWorker.execute {
        try {
          val environment = ortEnvironment ?: OrtEnvironment.getEnvironment().also { ortEnvironment = it }
          var session = ortSession
          if (session == null || ortPath != modelPath) {
            session?.close()
            val options = OrtSession.SessionOptions()
            options.setIntraOpNumThreads(4)
            session = environment.createSession(modelPath, options)
            ortSession = session
            ortPath = modelPath
          }
          // The input as a direct buffer of decimals (what the runtime wants)
          val inputBytes = Base64.decode(tensorBase64, Base64.NO_WRAP)
          val direct = ByteBuffer.allocateDirect(inputBytes.size).order(ByteOrder.LITTLE_ENDIAN)
          direct.put(inputBytes)
          direct.rewind()
          val input = OnnxTensor.createTensor(environment, direct.asFloatBuffer(), longArrayOf(1, 3, 224, 224))
          try {
            val model: OrtSession = session ?: throw IllegalStateException("The AI model is not open")
            val result = model.run(mapOf("pixel_values" to input))
            try {
              val output = result.get(0) as OnnxTensor
              val shape = output.info.shape
              val decimals = output.floatBuffer
              val answer = ByteBuffer.allocate(decimals.remaining() * 4).order(ByteOrder.LITTLE_ENDIAN)
              answer.asFloatBuffer().put(decimals)
              promise.resolve(mapOf("dims" to shape.map { it.toInt() }, "data" to Base64.encodeToString(answer.array(), Base64.NO_WRAP)))
            } finally {
              result.close()
            }
          } finally {
            input.close()
          }
        } catch (error: Throwable) {
          fail(promise, "ERR_AI_MODEL", "The AI model could not be run", error)
        }
      }
    }

    // A card that was FOUND in the photo (four corners, so it may be tilted or seen from the side) cut out flat and upright, and saved
    // as a new small picture file whose path is given back. The app then reads that file exactly like a photo with the card filling it
    // (the card is the whole picture), and deletes it with deletePhoto. "quad" is eight numbers: x then y for the card's top-left, top-right,
    // bottom-right and bottom-left corners, as shares of the UPRIGHT photo (0 to 1; a little outside is fine). "outHeight" is how tall the
    // flat picture is (its width follows the card's shape, 63 : 88).
    // (NEW, not yet tried on a phone: the app's JavaScript only calls it if it exists, so an older build is unaffected.)
    AsyncFunction("flattenCard") { path: String, quad: List<Double>, outHeight: Int, promise: Promise ->
      worker.execute {
        var upright: Bitmap? = null
        var flat: Bitmap? = null
        try {
          val context = appContext.reactContext ?: throw IllegalStateException("The app is not ready")
          if (quad.size != 8) throw IllegalArgumentException("Four corners are needed")
          val height = outHeight.coerceIn(200, 2000)
          val width = Math.round(height * 63.0 / 88.0).toInt()
          // The box round the card, as shares of the photo, only to decide how big to open the photo
          val xs = listOf(quad[0], quad[2], quad[4], quad[6])
          val ys = listOf(quad[1], quad[3], quad[5], quad[7])
          val left = xs.min().coerceIn(0.0, 1.0)
          val top = ys.min().coerceIn(0.0, 1.0)
          val box = listOf(left, top, (xs.max().coerceIn(0.0, 1.0) - left).coerceAtLeast(0.05), (ys.max().coerceIn(0.0, 1.0) - top).coerceAtLeast(0.05))
          val photo = openFor(path, box)
          // The whole photo turned upright (a copy), so the corners' shares apply straight to it
          val whole = cut(photo, listOf(0.0, 0.0, 1.0, 1.0))
          upright = whole
          val source = FloatArray(8) { index -> (quad[index] * (if (index % 2 == 0) whole.width else whole.height)).toFloat() }
          val target = floatArrayOf(0f, 0f, width.toFloat(), 0f, width.toFloat(), height.toFloat(), 0f, height.toFloat())
          val matrix = Matrix()
          if (!matrix.setPolyToPoly(source, 0, target, 0, 4)) throw IllegalStateException("The corners do not make a card shape")
          val made = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          flat = made
          Canvas(made).drawBitmap(whole, matrix, Paint(Paint.FILTER_BITMAP_FLAG))
          whole.recycle()
          upright = null
          val file = File.createTempFile("flat-", ".jpg", context.cacheDir)
          FileOutputStream(file).use { made.compress(Bitmap.CompressFormat.JPEG, 92, it) }
          made.recycle()
          flat = null
          promise.resolve(file.absolutePath)
        } catch (error: Throwable) {
          try { upright?.recycle() } catch (ignored: Throwable) { /* nothing more to free */ }
          try { flat?.recycle() } catch (ignored: Throwable) { /* nothing more to free */ }
          fail(promise, "ERR_CARD_FLATTEN", "The card could not be cut out", error)
        }
      }
    }

    // Get Google's reader loaded and ready before the first real scan, by reading a tiny blank picture.
    // (NEW, not yet tried on a phone: the app's JavaScript only calls it if it exists, so an older build is unaffected.)
    AsyncFunction("warmUp") { promise: Promise ->
      worker.execute {
        try {
          val blank = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
          Tasks.await(recognizer.process(InputImage.fromBitmap(blank, 0)))
          blank.recycle()
          promise.resolve(null)
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_WARM", "The reader could not be warmed up", error)
        }
      }
    }

    // Open the card catalogue file (full path, no "file://") for reading. Gives true when it is open.
    AsyncFunction("catalogueOpen") { path: String, promise: Promise ->
      catalogueWorker.execute {
        try {
          promise.resolve(catalogue.open(path))
        } catch (error: Throwable) {
          reject(promise, "ERR_CATALOGUE_OPEN", "The catalogue could not be opened", error)
        }
      }
    }

    // Close the card catalogue (the file stays)
    AsyncFunction("catalogueClose") { promise: Promise ->
      catalogueWorker.execute {
        try {
          catalogue.close()
          promise.resolve(null)
        } catch (error: Throwable) {
          reject(promise, "ERR_CATALOGUE_CLOSE", "The catalogue could not be closed", error)
        }
      }
    }

    // Ask the catalogue a question. "paramsJson" is the values for the question's "?" places, as JSON text (a list).
    // Gives back JSON text: {"columns":[...],"rows":[[...]]}
    AsyncFunction("catalogueQuery") { sql: String, paramsJson: String, promise: Promise ->
      catalogueWorker.execute {
        try {
          promise.resolve(catalogue.query(sql, paramsJson))
        } catch (error: Throwable) {
          reject(promise, "ERR_CATALOGUE_QUERY", "The catalogue could not be asked", error)
        }
      }
    }

    // The saved value under this full name ("wubrgrexpo:..."), read in pieces so it works even when it is too big
    // for AsyncStorage to read. Null if there is no such value.
    AsyncFunction("readStoredValue") { key: String, promise: Promise ->
      storedWorker.execute {
        try {
          val context = appContext.reactContext ?: throw IllegalStateException("The app is not ready")
          promise.resolve(StoredValue.read(context, key))
        } catch (error: Throwable) {
          reject(promise, "ERR_STORED_VALUE", "The saved value could not be read", error)
        }
      }
    }

    // Done with a photo: let go of it, and remove the file too if the camera took it
    AsyncFunction("deletePhoto") { path: String, deleteFile: Boolean, promise: Promise ->
      worker.execute {
        try {
          if (path == open?.path) forget()
          if (deleteFile) File(path).delete()
          promise.resolve(null)
        } catch (error: Throwable) {
          fail(promise, "ERR_CARD_PHOTO", "The photo could not be removed", error)
        }
      }
    }
  }
}
