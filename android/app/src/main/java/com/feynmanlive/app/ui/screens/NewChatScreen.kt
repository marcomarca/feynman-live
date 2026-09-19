package com.feynmanlive.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.unit.dp
import com.feynmanlive.app.domain.model.FeynmanConstants
import com.feynmanlive.app.domain.model.NewChatDraft
import com.feynmanlive.app.domain.repository.ChatRepository
import com.feynmanlive.app.domain.repository.SettingsRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewChatScreen(
    chatRepository: ChatRepository,
    settingsRepository: SettingsRepository,
    onBack: () -> Unit,
    onChatCreated: (String) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var tutorPrompt by remember { mutableStateOf("") }
    var studyMaterial by remember { mutableStateOf("") }
    var selectedVoice by remember { mutableStateOf("Puck") }
    var isVoiceDropdownExpanded by remember { mutableStateOf(false) }

    val clipboardManager = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    var isSubmitting by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val settings = settingsRepository.getSettings()
        selectedVoice = settings.defaultVoice
    }

    val isFormValid = tutorPrompt.trim().isNotEmpty() && studyMaterial.trim().isNotEmpty()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nueva sesión de estudio") },
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
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Título (opcional)") },
                placeholder = { Text("Ej: Conceptos de Gravitación") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Prompt del Tutor *",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    OutlinedButton(
                        onClick = { tutorPrompt = FeynmanConstants.DEFAULT_TUTOR_PROMPT },
                    ) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null)
                        Spacer(modifier = Modifier.padding(2.dp))
                        Text("Usar plantilla Feynman")
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = tutorPrompt,
                    onValueChange = { tutorPrompt = it },
                    placeholder = { Text("Reglas pedagógicas para el tutor...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                )
            }

            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Material de Estudio *",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    OutlinedButton(
                        onClick = {
                            clipboardManager.getText()?.text?.let { clipText ->
                                if (clipText.isNotBlank()) {
                                    studyMaterial = clipText
                                }
                            }
                        },
                    ) {
                        Icon(Icons.Default.ContentPaste, contentDescription = null)
                        Spacer(modifier = Modifier.padding(2.dp))
                        Text("Pegar")
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = studyMaterial,
                    onValueChange = { studyMaterial = it },
                    placeholder = { Text("Pega el texto, apuntes o capítulo a estudiar...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                )
            }

            ExposedDropdownMenuBox(
                expanded = isVoiceDropdownExpanded,
                onExpandedChange = { isVoiceDropdownExpanded = it },
            ) {
                OutlinedTextField(
                    value = selectedVoice,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Voz del tutor") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isVoiceDropdownExpanded) },
                    modifier = Modifier
                        .menuAnchor()
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = isVoiceDropdownExpanded,
                    onDismissRequest = { isVoiceDropdownExpanded = false },
                ) {
                    FeynmanConstants.AVAILABLE_VOICES.forEach { voice ->
                        DropdownMenuItem(
                            text = { Text(voice) },
                            onClick = {
                                selectedVoice = voice
                                isVoiceDropdownExpanded = false
                            },
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = {
                    if (isFormValid && !isSubmitting) {
                        isSubmitting = true
                        scope.launch {
                            val draft = NewChatDraft(
                                title = title,
                                tutorPrompt = tutorPrompt,
                                studyMaterial = studyMaterial,
                                voice = selectedVoice,
                            )
                            val created = chatRepository.create(draft)
                            onChatCreated(created.id.value)
                        }
                    }
                },
                enabled = isFormValid && !isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                Text(if (isSubmitting) "Creando sesión..." else "Iniciar estudio")
            }
        }
    }
}
