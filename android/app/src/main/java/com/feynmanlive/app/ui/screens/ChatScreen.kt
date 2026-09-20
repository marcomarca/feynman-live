package com.feynmanlive.app.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.feynmanlive.app.domain.compiler.StudyContextCompiler
import com.feynmanlive.app.domain.model.ChatId
import com.feynmanlive.app.domain.model.ChatMessage
import com.feynmanlive.app.domain.model.ChatRole
import com.feynmanlive.app.domain.repository.ChatRepository
import com.feynmanlive.app.live.SessionStatus
import com.feynmanlive.app.live.StudySessionCoordinator
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    chatId: String,
    chatRepository: ChatRepository,
    coordinator: StudySessionCoordinator,
    onBack: () -> Unit,
    onOpenContext: (String) -> Unit,
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val scope = rememberCoroutineScope()

    val chatWithMessages by chatRepository.observeChat(ChatId(chatId)).collectAsState(initial = null)
    val sessionStatus by coordinator.status.collectAsState()
    val modelDelta by coordinator.modelTextDelta.collectAsState()
    val userTranscription by coordinator.userTranscription.collectAsState()

    var isMaterialExpanded by remember { mutableStateOf(false) }
    var textInput by remember { mutableStateOf("") }
    var isMuted by remember { mutableStateOf(false) }
    var showFallbackDialog by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { isGranted ->
        if (isGranted) {
            scope.launch {
                coordinator.start(ChatId(chatId), scope)
            }
        }
    }

    LaunchedEffect(chatWithMessages?.messages?.size) {
        val count = chatWithMessages?.messages?.size ?: 0
        if (count > 0) {
            listState.animateScrollToItem(count - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = chatWithMessages?.chat?.title ?: "Estudio",
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                        )
                        StatusBadge(sessionStatus)
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            scope.launch { coordinator.stop() }
                            onBack()
                        },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás")
                    }
                },
                actions = {
                    IconButton(onClick = { onOpenContext(chatId) }) {
                        Icon(Icons.Default.Description, contentDescription = "Ver contexto")
                    }
                    IconButton(onClick = { showFallbackDialog = true }) {
                        Icon(Icons.Default.Share, contentDescription = "Fallback portable")
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
                .padding(innerPadding),
        ) {
            // Collapsible Study Material Banner
            chatWithMessages?.chat?.let { chat ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Material de estudio de este chat",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            IconButton(
                                onClick = { isMaterialExpanded = !isMaterialExpanded },
                                modifier = Modifier.size(24.dp),
                            ) {
                                Icon(
                                    imageVector = if (isMaterialExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                    contentDescription = null,
                                )
                            }
                        }
                        AnimatedVisibility(visible = isMaterialExpanded) {
                            Column(modifier = Modifier.padding(top = 8.dp)) {
                                Text(
                                    text = chat.context.studyMaterial,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                }
            }

            // Message History
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val messages = chatWithMessages?.messages ?: emptyList()
                items(messages, key = { it.id.value }) { message ->
                    MessageBubble(message)
                }

                // Streaming feedback indicator
                if (userTranscription.isNotBlank()) {
                    item {
                        RealtimeStreamBubble(role = ChatRole.USER, text = userTranscription)
                    }
                }
                if (modelDelta.isNotBlank()) {
                    item {
                        RealtimeStreamBubble(role = ChatRole.MODEL, text = modelDelta)
                    }
                }
            }

            // Bottom Controls
            Surface(
                modifier = Modifier.fillMaxWidth(),
                tonalElevation = 4.dp,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = textInput,
                            onValueChange = { textInput = it },
                            placeholder = { Text("Escribe una pregunta...") },
                            modifier = Modifier.weight(1f),
                            maxLines = 3,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        FilledIconButton(
                            onClick = {
                                if (textInput.isNotBlank()) {
                                    val toSend = textInput
                                    textInput = ""
                                    scope.launch {
                                        if (sessionStatus is SessionStatus.Idle) {
                                            val startRes = coordinator.start(ChatId(chatId), scope)
                                            if (startRes.isFailure) return@launch
                                        }
                                        coordinator.sendText(toSend)
                                    }
                                }
                            },
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar")
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val isSessionActive = sessionStatus !is SessionStatus.Idle && sessionStatus !is SessionStatus.Error && sessionStatus !is SessionStatus.Stopping

                        if (isSessionActive) {
                            IconButton(
                                onClick = {
                                    isMuted = !isMuted
                                    coordinator.mute(isMuted)
                                },
                            ) {
                                Icon(
                                    imageVector = if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                                    contentDescription = if (isMuted) "Activar micrófono" else "Mutear",
                                    tint = if (isMuted) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                                )
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                        }

                        FloatingActionButton(
                            onClick = {
                                scope.launch {
                                    if (isSessionActive) {
                                        coordinator.stop()
                                    } else {
                                        val hasPermission = ContextCompat.checkSelfPermission(
                                            context,
                                            Manifest.permission.RECORD_AUDIO,
                                        ) == PackageManager.PERMISSION_GRANTED

                                        if (hasPermission) {
                                            coordinator.start(ChatId(chatId), scope)
                                        } else {
                                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                        }
                                    }
                                }
                            },
                            containerColor = if (isSessionActive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            contentColor = Color.White,
                        ) {
                            Icon(
                                imageVector = if (isSessionActive) Icons.Default.Stop else Icons.Default.Mic,
                                contentDescription = if (isSessionActive) "Detener sesión" else "Iniciar voz Live",
                            )
                        }
                    }
                }
            }
        }

        // Portable Fallback Dialog
        if (showFallbackDialog) {
            chatWithMessages?.chat?.let { chat ->
                val compiledPrompt = remember(chat) {
                    StudyContextCompiler.compile(chat.context)
                }

                AlertDialog(
                    onDismissRequest = { showFallbackDialog = false },
                    title = { Text("Fallback Portable") },
                    text = {
                        Column {
                            Text("Puedes exportar o abrir el contexto de este chat en un proveedor alternativo:")
                            Spacer(modifier = Modifier.height(12.dp))
                            TextButton(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString(compiledPrompt))
                                    showFallbackDialog = false
                                },
                            ) {
                                Text("Copiar prompt compilado al portapapeles")
                            }
                            TextButton(
                                onClick = {
                                    val sendIntent = Intent().apply {
                                        action = Intent.ACTION_SEND
                                        putExtra(Intent.EXTRA_TEXT, compiledPrompt)
                                        type = "text/plain"
                                    }
                                    context.startActivity(Intent.createChooser(sendIntent, "Compartir prompt"))
                                    showFallbackDialog = false
                                },
                            ) {
                                Text("Compartir prompt...")
                            }
                            TextButton(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString(compiledPrompt))
                                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://aistudio.google.com/live?model=gemini-3.1-flash-live-preview"))
                                    context.startActivity(browserIntent)
                                    showFallbackDialog = false
                                },
                            ) {
                                Text("Copiar y abrir Google AI Studio")
                            }
                            TextButton(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString(compiledPrompt))
                                    val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://chatgpt.com/"))
                                    context.startActivity(browserIntent)
                                    showFallbackDialog = false
                                },
                            ) {
                                Text("Copiar y abrir ChatGPT")
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = { showFallbackDialog = false }) {
                            Text("Cerrar")
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun StatusBadge(status: SessionStatus) {
    val (text, color) = when (status) {
        is SessionStatus.Idle -> "Inactivo" to Color.Gray
        is SessionStatus.Connecting -> "Conectando..." to MaterialTheme.colorScheme.primary
        is SessionStatus.Listening -> "Escuchando" to MaterialTheme.colorScheme.primary
        is SessionStatus.UserSpeaking -> "Hablando..." to MaterialTheme.colorScheme.secondary
        is SessionStatus.AwaitingServerAck -> "Enviando..." to MaterialTheme.colorScheme.secondary
        is SessionStatus.AwaitingModelOutput -> "Pensando..." to MaterialTheme.colorScheme.secondary
        is SessionStatus.ModelSpeaking -> "Tutor hablando" to MaterialTheme.colorScheme.primary
        is SessionStatus.Reconnecting -> "Reconectando (${status.attempt}/${status.maxAttempts})" to Color(0xFFF59E0B)
        is SessionStatus.Error -> "Error: ${status.code}" to MaterialTheme.colorScheme.error
        is SessionStatus.Stopping -> "Deteniendo..." to Color.Gray
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color, CircleShape),
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(text = text, style = MaterialTheme.typography.labelSmall, color = color)
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == ChatRole.USER
    val alignment = if (isUser) Alignment.End else Alignment.Start
    val bgColor = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val textColor = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = alignment,
    ) {
        Surface(
            color = bgColor,
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 2.dp,
                bottomEnd = if (isUser) 2.dp else 16.dp,
            ),
            tonalElevation = 1.dp,
        ) {
            Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                Text(
                    text = message.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = textColor,
                )
                if (message.audioDurationMs != null && message.audioDurationMs > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "🔊 ${message.audioDurationMs / 1000}s de audio guardado",
                        style = MaterialTheme.typography.labelSmall,
                        color = textColor.copy(alpha = 0.7f),
                    )
                }
            }
        }
    }
}

@Composable
private fun RealtimeStreamBubble(role: ChatRole, text: String) {
    val isUser = role == ChatRole.USER
    val alignment = if (isUser) Alignment.End else Alignment.Start
    val bgColor = if (isUser) MaterialTheme.colorScheme.secondary.copy(alpha = 0.3f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = alignment,
    ) {
        Surface(
            color = bgColor,
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(10.dp),
            )
        }
    }
}
