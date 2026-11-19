// =====================================================================
// THE CATALOGUE READER AND THE STORED-VALUE RESCUE (Android's half)
// Two small helpers that use the phone's OWN built-in database code (android.database.sqlite, which every
// Android phone has, so no extra add-on is needed):
//   CatalogueReader  -> opens the card catalogue file (read-only) and answers questions (SQL) about it.
//                       It replaces the "expo-sqlite" add-on, which was not found on the user's phone.
//   StoredValue      -> reads one saved value out of the app's saved-values database (AsyncStorage's "RKStorage")
//                       in small pieces, so a value bigger than the phone's 2 MB reading window can still be read.
// Both are used from CardTextReaderModule.kt, always from one helper thread at a time.
// =====================================================================

package expo.modules.cardtextreader

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteCursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteProgram
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject

// Keeps the opened catalogue and answers questions about it
class CatalogueReader {
  // The opened catalogue (null while closed)
  private var db: SQLiteDatabase? = null

  // Open the catalogue file for reading only (nothing can ever be changed in it). Any open one is closed first.
  fun open(path: String): Boolean {
    close()
    db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY)
    return true
  }

  // Close it (the file stays where it is)
  fun close() {
    val opened = db
    db = null
    opened?.close()
  }

  // Put each value of "params" (a JSON list) into the question's "?" places, keeping its real kind:
  // whole numbers as whole numbers, other numbers as decimals, text as text, nothing as null. (Giving everything
  // as text would break questions like "LIMIT ?", which need a real number.) Places are counted from 1.
  private fun bindAll(program: SQLiteProgram, params: JSONArray) {
    for (i in 0 until params.length()) {
      val place = i + 1
      if (params.isNull(i)) {
        program.bindNull(place)
        continue
      }
      val value = params.get(i)
      when (value) {
        is Int -> program.bindLong(place, value.toLong())
        is Long -> program.bindLong(place, value)
        is Boolean -> program.bindLong(place, if (value) 1L else 0L)
        is Number -> program.bindDouble(place, value.toDouble())
        else -> program.bindString(place, value.toString())
      }
    }
  }

  // Add one cell of the answer to the text being built, as JSON: whole numbers and decimals as numbers, nothing as null,
  // text as quoted text, and a blob of bytes as {"b":"<the bytes packed as text>"}
  private fun appendCell(out: StringBuilder, cursor: Cursor, column: Int) {
    when (cursor.getType(column)) {
      Cursor.FIELD_TYPE_NULL -> out.append("null")
      Cursor.FIELD_TYPE_INTEGER -> out.append(cursor.getLong(column))
      Cursor.FIELD_TYPE_FLOAT -> {
        val number = cursor.getDouble(column)
        // JSON has no way to write "not a number" or "infinite", so those become null
        if (number.isNaN() || number.isInfinite()) out.append("null") else out.append(number)
      }
      Cursor.FIELD_TYPE_BLOB -> out.append("{\"b\":\"").append(Base64.encodeToString(cursor.getBlob(column), Base64.NO_WRAP)).append("\"}")
      else -> out.append(JSONObject.quote(cursor.getString(column)))
    }
  }

  // Ask a question. Gives back JSON text: {"columns":["a","b"],"rows":[[1,"x"],[2,null]]}
  fun query(sql: String, paramsJson: String): String {
    val database = db ?: throw IllegalStateException("The catalogue is not open")
    val params = JSONArray(paramsJson)
    // Android makes the answer-holder ("cursor") through this factory, and the factory is where the typed values are put
    // in (the plain way of giving values always sends them as text)
    val factory = SQLiteDatabase.CursorFactory { _, driver, editTable, query ->
      bindAll(query, params)
      SQLiteCursor(driver, editTable, query)
    }
    val cursor = database.rawQueryWithFactory(factory, sql, null, null)
    try {
      val columns = cursor.columnCount
      val out = StringBuilder()
      out.append("{\"columns\":[")
      for (i in 0 until columns) {
        if (i > 0) out.append(',')
        out.append(JSONObject.quote(cursor.getColumnName(i)))
      }
      out.append("],\"rows\":[")
      var first = true
      while (cursor.moveToNext()) {
        if (!first) out.append(',')
        first = false
        out.append('[')
        for (i in 0 until columns) {
          if (i > 0) out.append(',')
          appendCell(out, cursor, i)
        }
        out.append(']')
      }
      out.append("]}")
      return out.toString()
    } finally {
      cursor.close()
    }
  }
}

// Reads one saved value out of AsyncStorage's own database, a piece at a time
object StoredValue {
  // How many characters are read at once (small enough to fit the 2 MB reading window even for 4-byte characters)
  private const val PIECE = 400_000

  // The value saved under "key", or null if there is none (or the database isn't there). Throws if it can't be read.
  fun read(context: Context, key: String): String? {
    val file = context.getDatabasePath("RKStorage")
    if (!file.exists()) return null
    val database = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY)
    try {
      // First, how long the value is (asking for the length does not load the value into the reading window)
      var length = -1L
      database.rawQuery("SELECT length(value) FROM catalystLocalStorage WHERE key = ?", arrayOf(key)).use { cursor ->
        if (cursor.moveToFirst() && !cursor.isNull(0)) length = cursor.getLong(0)
      }
      if (length < 0L) return null
      // Then the value piece by piece (characters are counted from 1)
      val whole = StringBuilder()
      var start = 1L
      while (start <= length) {
        database.rawQuery("SELECT substr(value, $start, $PIECE) FROM catalystLocalStorage WHERE key = ?", arrayOf(key)).use { cursor ->
          if (cursor.moveToFirst()) whole.append(cursor.getString(0) ?: "")
        }
        start += PIECE
      }
      return whole.toString()
    } finally {
      database.close()
    }
  }
}
