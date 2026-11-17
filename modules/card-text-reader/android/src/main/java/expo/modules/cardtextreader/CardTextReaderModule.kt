// =====================================================================
// THE CARD TEXT READER (Android's half)
// The scanner screen takes a photo of a card and asks this add-on for things:
//   photoSize(path)        -> how big the photo is, turned the right way up (quick: the picture isn't opened)
//   readParts(...)         -> the text in each requested part of the card
//   grayCrops(...)         -> parts of the card as grey pictures (for telling older printings apart)
//   jpegCrop(...)          -> one part of the card as a small JPEG picture (to show on screen)
//   deletePhoto(path)      -> tidy up a photo the camera took
// Reading is done by Google's ML Kit, which runs on the phone itself (no
// internet needed). The photo is opened here, in the phone's own code, rather
// than sent through the app's JavaScript, because photos are big and this is much faster.
// SPEED: the photo is opened only once it is known where the card is, and only as big as
// reading needs (a huge photo is opened at half or quarter size), and it is NOT turned
// upright as a whole (that would copy every pixel): each small piece that is cut out is
// turned instead. The last photo opened is kept in memory, so asking for several
// things from the same photo only opens it once.
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

// How wide the card should be when opened, in pixels, at the least. A photo that would still
// leave the card this wide after being halved (or quartered) is opened smaller, which is faster
// and uses much less memory.
private const val CARD_WIDTH_WANTED = 1700

// The photo as opened: the picture itself (possibly shrunk), how many times it was shrunk,
// and how it must be turned to be upright (0, 90, 180 or 270 degrees)
private class OpenPhoto(val path: String, val picture: Bitmap?, val shrunkBy: Int, val turn: Int, val rawWidth: Int, val rawHeight: Int)

class CardTextReaderModule : Module() {
  // Google's reader, made the first time it's needed and kept after that
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  // One helper thread, so opening and reading photos never freezes the screen
  // (and two scans never run on top of each other)
  private val worker = Executors.newSingleThreadExecutor()

  // The photo most recently opened, kept for the next request
  private var open: OpenPhoto? = null

  // Let go of the kept photo (a picture takes a lot of the phone's memory)
  private fun forget() {
    open?.picture?.recycle()
    open = null
  }

  // How the photo's file says it must be turned to be upright (phones usually save photos sideways),
  // and its size as stored. Reads only the file's small header, not the picture.
  private fun look(path: String): OpenPhoto {
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
    if (seen.picture != null && seen.shrunkBy == shrink) return seen
    seen.picture?.recycle()
    val picture = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = shrink })
      ?: throw IllegalStateException("The photo could not be opened")
    val opened = OpenPhoto(path, picture, shrink, seen.turn, seen.rawWidth, seen.rawHeight)
    open = opened
    return opened
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
    // Wait here for Google's answer (fine: this runs on our helper thread, not the screen's)
    val result = Tasks.await(recognizer.process(InputImage.fromBitmap(piece, 0)))
    piece.recycle()
    return result.text.trim()
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

  override fun definition() = ModuleDefinition {
    // The name the app's JavaScript uses to find this add-on
    Name("CardTextReader")

    // How big the photo is once it's upright: [width, height]. Only the file's header is read.
    AsyncFunction("photoSize") { path: String, promise: Promise ->
      worker.execute {
        try {
          val photo = open?.takeIf { it.path == path } ?: look(path).also { forget(); open = it }
          val (width, height) = uprightSize(photo)
          promise.resolve(listOf(width, height))
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
          val photo = openFor(path, card)
          promise.resolve(parts.map { readBox(photo, inPhoto(card, it)) })
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
          val photo = openFor(path, card)
          promise.resolve(parts.mapIndexed { index, part -> grayBox(photo, inPhoto(card, part), maxWidths[index]) })
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_CROP", error.message ?: "The card could not be cropped", error))
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
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_CROP", error.message ?: "The card could not be cropped", error))
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
        } catch (error: Exception) {
          promise.reject(CodedException("ERR_CARD_PHOTO", error.message ?: "The photo could not be removed", error))
        }
      }
    }
  }
}
