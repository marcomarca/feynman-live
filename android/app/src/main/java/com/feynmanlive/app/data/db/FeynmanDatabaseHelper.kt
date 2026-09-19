package com.feynmanlive.app.data.db

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class FeynmanDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                tutorPrompt TEXT NOT NULL,
                studyMaterial TEXT NOT NULL,
                voice TEXT NOT NULL,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            )
            """.trimIndent()
        )

        db.execSQL(
            """
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                chatId TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                audioPath TEXT,
                audioDurationMs INTEGER,
                createdAt INTEGER NOT NULL,
                FOREIGN KEY (chatId) REFERENCES chats (id) ON DELETE CASCADE
            )
            """.trimIndent()
        )

        db.execSQL("CREATE INDEX idx_messages_chatId ON messages(chatId)")
        db.execSQL("CREATE UNIQUE INDEX idx_messages_chat_seq ON messages(chatId, sequence)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Schema migrations if needed in future versions
    }

    companion object {
        const val DATABASE_NAME = "feynman_live.db"
        const val DATABASE_VERSION = 1
    }
}
