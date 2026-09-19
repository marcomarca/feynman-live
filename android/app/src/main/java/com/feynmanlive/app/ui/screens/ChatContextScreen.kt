package com.feynmanlive.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.feynmanlive.app.domain.model.ChatId
import com.feynmanlive.app.domain.model.StudyContext
import com.feynmanlive.app.domain.repository.ChatRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatContextScreen(
    chatId: String,
    chatRepository: ChatRepository,
    onBack: () -> Unit,
) {
    var prompt by remember { mutableStateOf("") }
    var material by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var isSaving by remember { mutableStateOf(false) }

    LaunchedEffect(chatId) {
        val chat = chatRepository.getChat(ChatId(chatId))
        if (chat != null) {
            prompt = chat.chat.context.tutorPrompt
            material = chat.chat.context.studyMaterial
            title = chat.chat.title
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Contexto: $title") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Modificar este contexto solo afectará a este chat específico.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )

            Column {
                Text(
                    text = "Prompt del Tutor",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                )
            }

            Column {
                Text(
                    text = "Material de Estudio",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = material,
                    onValueChange = { material = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(240.dp),
                )
            }

            Button(
                onClick = {
                    if (prompt.isNotBlank() && material.isNotBlank() && !isSaving) {
                        isSaving = true
                        scope.launch {
                            chatRepository.updateContext(
                                chatId = ChatId(chatId),
                                context = StudyContext(
                                    tutorPrompt = prompt.trim(),
                                    studyMaterial = material.trim(),
                                ),
                            )
                            onBack()
                        }
                    }
                },
                enabled = prompt.isNotBlank() && material.isNotBlank() && !isSaving,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
            ) {
                Text(if (isSaving) "Guardando..." else "Guardar contexto")
            }
        }
    }
}
