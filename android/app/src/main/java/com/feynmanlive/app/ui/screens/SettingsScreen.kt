package com.feynmanlive.app.ui.screens

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.feynmanlive.app.domain.diagnostics.DiagnosticStep
import com.feynmanlive.app.domain.diagnostics.DiagnosticStepStatus
import com.feynmanlive.app.domain.diagnostics.GeminiApiTester
import com.feynmanlive.app.domain.model.FeynmanConstants
import com.feynmanlive.app.domain.repository.SecretStore
import com.feynmanlive.app.domain.repository.SettingsRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settingsRepository: SettingsRepository,
    secretStore: SecretStore,
    apiTester: GeminiApiTester,
    onBack: () -> Unit,
) {
    val settings by settingsRepository.settings.collectAsState(initial = null)
    val diagnosticReport by apiTester.report.collectAsState()
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    var isVoiceDropdownExpanded by remember { mutableStateOf(false) }
    var isModelDropdownExpanded by remember { mutableStateOf(false) }

    var hasApiKey by remember { mutableStateOf(false) }
    var apiKeyInput by remember { mutableStateOf("") }
    var isKeyVisible by remember { mutableStateOf(false) }
    var keyStatusMessage by remember { mutableStateOf<String?>(null) }
    var isSuccessMessage by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        hasApiKey = secretStore.hasApiKey()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Configuración") },
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
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Card: API Key de Google Gemini
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Key,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "API Key de Gemini",
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }

                        if (hasApiKey) {
                            SuggestionChip(
                                onClick = {},
                                label = { Text("Cifrada", style = MaterialTheme.typography.labelSmall) },
                                icon = {
                                    Icon(
                                        Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.height(16.dp),
                                    )
                                },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                                    labelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                ),
                            )
                        } else {
                            SuggestionChip(
                                onClick = {},
                                label = { Text("Sin clave", style = MaterialTheme.typography.labelSmall) },
                                icon = {
                                    Icon(
                                        Icons.Default.Warning,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.height(16.dp),
                                    )
                                },
                                colors = SuggestionChipDefaults.suggestionChipColors(
                                    containerColor = MaterialTheme.colorScheme.errorContainer,
                                    labelColor = MaterialTheme.colorScheme.onErrorContainer,
                                ),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = if (hasApiKey) {
                            "Hay una API Key configurada en el almacén seguro del dispositivo."
                        } else {
                            "Introduce tu API Key de Google AI Studio para habilitar la voz bidireccional en vivo de Gemini Live."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = apiKeyInput,
                        onValueChange = { apiKeyInput = it },
                        label = { Text("Clave de API (AIzaSy...)") },
                        placeholder = { Text("Pega tu clave aquí") },
                        singleLine = true,
                        visualTransformation = if (isKeyVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { isKeyVisible = !isKeyVisible }) {
                                Icon(
                                    if (isKeyVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = "Alternar visibilidad",
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Button(
                            onClick = {
                                if (apiKeyInput.isNotBlank()) {
                                    scope.launch {
                                        val res = secretStore.saveApiKey(apiKeyInput.trim())
                                        if (res.isSuccess) {
                                            hasApiKey = true
                                            val savedKey = apiKeyInput.trim()
                                            apiKeyInput = ""
                                            keyStatusMessage = "Clave cifrada y guardada en Android Keystore."
                                            isSuccessMessage = true
                                            // Ejecutar diagnóstico automáticamente al guardar
                                            apiTester.runFullDiagnostic(
                                                apiKey = savedKey,
                                                preferredModel = settings?.modelName ?: "gemini-2.0-flash-realtime-exp",
                                            )
                                        } else {
                                            keyStatusMessage = "Error al guardar la clave: ${res.exceptionOrNull()?.message}"
                                            isSuccessMessage = false
                                        }
                                    }
                                }
                            },
                            enabled = apiKeyInput.isNotBlank(),
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Guardar clave")
                        }

                        if (hasApiKey) {
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        secretStore.deleteApiKey()
                                        hasApiKey = false
                                        apiKeyInput = ""
                                        keyStatusMessage = "Clave eliminada permanentemente del enclave seguro."
                                        isSuccessMessage = true
                                    }
                                },
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Eliminar")
                            }
                        }
                    }

                    keyStatusMessage?.let { msg ->
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = msg,
                            style = MaterialTheme.typography.bodySmall,
                            color = if (isSuccessMessage) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(
                            Icons.Default.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.height(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Seguridad: Cifrado por hardware en Android Keystore (TEE/StrongBox). La clave nunca se comparte.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                    }
                }
            }

            // Card: Diagnóstico Interactivo y Pruebas de API
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(
                            Icons.Default.NetworkCheck,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Diagnóstico y Prueba de API",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = "Evalúa paso a paso cada fase de la comunicación: autenticación REST, handshake WebSocket, configuración del modelo y respuesta bidireccional.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = {
                            scope.launch {
                                val key = secretStore.getApiKey() ?: ""
                                val currentModel = settings?.modelName ?: "gemini-2.0-flash-realtime-exp"
                                val report = apiTester.runFullDiagnostic(key, currentModel)
                                if (report.recommendedModel != null && settings != null) {
                                    settingsRepository.update(settings!!.copy(modelName = report.recommendedModel))
                                }
                            }
                        },
                        enabled = hasApiKey && !diagnosticReport.isRunning,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (diagnosticReport.isRunning) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Ejecutando pruebas...")
                        } else {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Probar conexión paso a paso")
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Lista de pasos de diagnóstico
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        diagnosticReport.steps.forEach { step ->
                            DiagnosticStepItem(step)
                        }
                    }

                    // Recomendación automática si se descubrió un modelo
                    diagnosticReport.recommendedModel?.let { recModel ->
                        if (settings?.modelName != recModel) {
                            Spacer(modifier = Modifier.height(12.dp))
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        settings?.let { s ->
                                            settingsRepository.update(s.copy(modelName = recModel))
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Usar modelo recomendado: $recModel")
                            }
                        }
                    }
                }
            }

            // Card: Modelo de Gemini y Voz
            settings?.let { s ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Modelo de Gemini Live",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Selecciona el identificador del modelo para la sesión WebSocket:",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        val availableModels = remember(diagnosticReport.availableBidiModels) {
                            val list = mutableListOf<String>()
                            list.addAll(diagnosticReport.availableBidiModels)
                            GeminiApiTester.FALLBACK_BIDI_MODELS.forEach { m ->
                                if (!list.contains(m)) list.add(m)
                            }
                            list
                        }

                        ExposedDropdownMenuBox(
                            expanded = isModelDropdownExpanded,
                            onExpandedChange = { isModelDropdownExpanded = it },
                        ) {
                            OutlinedTextField(
                                value = s.modelName,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Modelo Activo") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isModelDropdownExpanded) },
                                modifier = Modifier
                                    .menuAnchor()
                                    .fillMaxWidth(),
                            )
                            ExposedDropdownMenu(
                                expanded = isModelDropdownExpanded,
                                onDismissRequest = { isModelDropdownExpanded = false },
                            ) {
                                availableModels.forEach { modelName ->
                                    DropdownMenuItem(
                                        text = { Text(modelName) },
                                        onClick = {
                                            isModelDropdownExpanded = false
                                            scope.launch {
                                                settingsRepository.update(s.copy(modelName = modelName))
                                            }
                                        },
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            text = "Voz Predeterminada",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = isVoiceDropdownExpanded,
                            onExpandedChange = { isVoiceDropdownExpanded = it },
                        ) {
                            OutlinedTextField(
                                value = s.defaultVoice,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Voz para nuevos chats") },
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
                                            isVoiceDropdownExpanded = false
                                            scope.launch {
                                                settingsRepository.update(s.copy(defaultVoice = voice))
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Incluir historial al reanudar",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                text = "Al reabrir un chat, pasa los mensajes previos como contexto al tutor.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = s.includeHistoryOnResume,
                            onCheckedChange = { checked ->
                                scope.launch {
                                    settingsRepository.update(s.copy(includeHistoryOnResume = checked))
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosticStepItem(step: DiagnosticStep) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                when (step.status) {
                    DiagnosticStepStatus.IDLE -> {
                        Box(
                            modifier = Modifier
                                .size(16.dp)
                                .background(Color.Gray.copy(alpha = 0.4f), CircleShape)
                        )
                    }
                    DiagnosticStepStatus.RUNNING -> {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    DiagnosticStepStatus.SUCCESS -> {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Color(0xFF10B981),
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    DiagnosticStepStatus.FAILURE -> {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                Text(
                    text = step.title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            step.detail?.let { detail ->
                Spacer(modifier = Modifier.height(4.dp))
                Surface(
                    color = when (step.status) {
                        DiagnosticStepStatus.FAILURE -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)
                        DiagnosticStepStatus.SUCCESS -> Color(0xFF10B981).copy(alpha = 0.1f)
                        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                    },
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = when (step.status) {
                            DiagnosticStepStatus.FAILURE -> MaterialTheme.colorScheme.onErrorContainer
                            else -> MaterialTheme.colorScheme.onSurface
                        },
                        modifier = Modifier.padding(8.dp),
                    )
                }
            }
        }
    }
}
