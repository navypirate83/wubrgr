// =====================================================================
// THE CARD TEXT READER (Android's half)
// The scanner screen takes a photo of a card and asks this add-on for things:
//   photoSize(path)        -> how big the photo is, turned the right way up
//   readParts(...)         -> the text in each requested part of the card
//   grayCrops(...)         -> parts of the card as grey pictures (for telling older printings apart)
//   jpegCrop(...)          -> one part of the card as a small JPEG picture (to show on screen)
//   deletePhoto(path)      -> tidy up a photo the camera took
// Reading is done by Google's ML Kit, which runs on the phone itself (no
// internet needed). The photo is opened here, in the phone's own code, rather
// than sent through the app's JavaScript, because photos are big and this is much faster.
// The last photo opened is kept in memory, so asking for several things from the
// same photo only opens it once.
// =====================================================================

package expo.modules.cardtextreader

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
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
import java.util.concurrent.Executors

class CardTextReaderModule : Module() {
  // Google's reader, made the first time it's needed and kept after that
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  // One helper thread, so opening and reading photos never freezes the screen
  // (and two scans never run on top of each other)
  private val worker = Executors.newSingleThreadExecutor()

  // The photo most recently opened (its file path and the picture), kept for the next request
  private var openPath: String? = null
  private var openPicture: Bitmap? = null

  // Let go of the kept photo (a picture takes a lot of the phone's memory)
  private fun forget() {
    openPicture?.recycle()
    openPicture = null
    openPath = null
  }

  // The photo opened as a picture in memory, turned upright using the "which way up"
  // note the camera wrote into the file (phones usually save photos sideways)
  private fun openUpright(path: String): Bitmap {
    if (path == openPath) openPicture?.let { return it }
    forget()
    val raw = BitmapFactory.decodeFile(path) ?: throw IllegalStateException("The photo could not be opened")
    val turn = when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90f
      ExifInterface.ORIENTATION_ROTATE_180 -> 180f
      ExifInterface.ORIENTATION_ROTATE_270 -> 270f
      else -> 0f
    }
    val upright = if (turn == 0f) raw else {
      val matrix = Matrix().apply { postRotate(turn) }
      val turned = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
      if (turned !== raw) raw.recycle()
      turned
    }
    openPath = path
    openPicture = upright
    return upright
  }

  // A box inside the card, as shares of the whole photo. "card" and "part" are both
  // (left, top, width, height); the part's numbers are shares of the card.
  private fun inPhoto(card: List<Double>, part: List<Double>): List<Double> = listOf(
    card[0] + part[0] * card[2],
    card[1] + part[1] * card[3],
    part[2] * card[2],
    part[3] * card[3],
  )

  // That box cut out of the picture (never empty, never outside the picture)
  private fun cut(picture: Bitmap, box: List<Double>): Bitmap {
    val left = (box[0] * picture.width).toInt().coerceIn(0, picture.width - 1)
    val top = (box[1] * picture.height).toInt().coerceIn(0, picture.height - 1)
    val width = (box[2] * picture.width).toInt().coerceIn(1, picture.width - left)
    val height = (box[3] * picture.height).toInt().coerceIn(1, picture.height - top)
    return Bitmap.createBitmap(picture, left, top, width, height)
  }

  // The text in one box of the picture
  private fun readBox(picture: Bitmap, box: List<Double>): String {
    var piece = cut(picture, box)
    // Small print reads better when it's bigger: blow a narrow piece up (never more than 3 times)
    if (piece.width < 700) {
      val grow = minOf(3.0, 700.0 / piece.width)
      val bigger = Bitmap.createScaledBitmap(piece, (piece.width * grow).toInt(), (piece.height * grow).toInt(), true)
      if (bigger !== piece) piece.recycle()
      piece = bigger
    }
    // Wait here for Google's answer (fine: this runs on our helper thread, not the screen's)
    val result = Tasks.await(recognizer.process(InputImage.fromBitmap(piece, 0)))
    piece.recycle()
    return result.text.trim()
  }

  // One box as a grey picture no wider than "maxWidth": its size, and one number from 0 to 255 for
  // each pixel (row by row), packed as text. Uses the same brightness sum as the website's reader.
  private fun grayBox(picture: Bitmap, box: List<Double>, maxWidth: Int): Map<String, Any> {
    val piece = cut(picture, box)
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

  override fun definition() = ModuleDefinition {
    // The name the app's JavaScript uses to find this add-on
    Name("CardTextReader")

    // How big the photo is once turned upright: [width, height]
    AsyncFunction("photoSize") { path: String, promise: Promise ->
      worker.execute {
        try {
          val picture = openUpright(path)
          promise.resolve(listOf(picture.width, picture.height))
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_PHOTO", error.message ?: "The photo could not be read", error))
        }
      }
    }

    // The text in each part of the card. "card" is where the card is in the photo and "parts" are the
    // boxes to read (each given as shares of the CARD: left, top, width, height). Gives back one piece of text
    // per part, in the same order.
    AsyncFunction("readParts") { path: String, card: List<Double>, parts: List<List<Double>>, promise: Promise ->
      worker.execute {
        try {
          val picture = openUpright(path)
          promise.resolve(parts.map { readBox(picture, inPhoto(card, it)) })
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_TEXT", error.message ?: "The card could not be read", error))
        }
      }
    }

    // Parts of the card as grey pictures (same box shape as readParts), each no wider than its
    // number in "maxWidths". Each answer has a width, a height and the pixels packed as text.
    AsyncFunction("grayCrops") { path: String, card: List<Double>, parts: List<List<Double>>, maxWidths: List<Int>, promise: Promise ->
      worker.execute {
        try {
          val picture = openUpright(path)
          promise.resolve(parts.mapIndexed { index, part -> grayBox(picture, inPhoto(card, part), maxWidths[index]) })
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_CROP", error.message ?: "The card could not be cropped", error))
        }
      }
    }

    // One part of the card as a small JPEG picture, packed as text (to show on the screen)
    AsyncFunction("jpegCrop") { path: String, card: List<Double>, part: List<Double>, width: Int, promise: Promise ->
      worker.execute {
        try {
          val picture = openUpright(path)
          val piece = cut(picture, inPhoto(card, part))
          val size = minOf(width, piece.width)
          val small = Bitmap.createScaledBitmap(piece, size, maxOf(1, Math.round(size.toDouble() * piece.height / piece.width).toInt()), true)
          if (small !== piece) piece.recycle()
          val bytes = ByteArrayOutputStream()
          small.compress(Bitmap.CompressFormat.JPEG, 80, bytes)
          small.recycle()
          promise.resolve(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_CROP", error.message ?: "The card could not be cropped", error))
        }
      }
    }

    // Done with a photo: let go of it, and remove the file too if the camera took it
    AsyncFunction("deletePhoto") { path: String, deleteFile: Boolean, promise: Promise ->
      worker.execute {
        try {
          if (path == openPath) forget()
          if (deleteFile) File(path).delete()
          promise.resolve(null)
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_PHOTO", error.message ?: "The photo could not be removed", error))
        }
      }
    }
  }
}
