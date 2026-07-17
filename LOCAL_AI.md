# IA local de REEBOT LAB

La primera integración usa **Ollama** como motor local y `qwen3.5:9b` como modelo recomendado para una GPU de 8 GB. No requiere suscripción ni envía las conversaciones a un servicio externo.

## Activación en Windows

1. Instala Ollama desde <https://ollama.com/download/windows>.
2. Abre PowerShell y descarga el modelo:

   ```powershell
   ollama pull qwen3.5:9b
   ```

3. Comprueba que responde:

   ```powershell
   ollama run qwen3.5:9b
   ```

4. Inicia REEBOT LAB. La aplicación detecta automáticamente la API local en `http://127.0.0.1:11434`.

Si Ollama no está disponible, REEBOT conserva un modo básico local basado en las métricas recibidas. Ese modo explica CPU, RAM, disco y procesos, pero se identifica claramente y no simula ser un modelo de IA.

## Configuración opcional

Antes de iniciar la aplicación puedes cambiar la dirección o el modelo:

```powershell
$env:REEBOT_OLLAMA_URL = "http://127.0.0.1:11434"
$env:REEBOT_AI_MODEL = "qwen3.5:9b"
```

## Límites de seguridad de esta versión

- La IA sólo recibe la pregunta, el perfil seleccionado y una instantánea de métricas.
- No lee archivos ni inspecciona rutas por sí sola.
- No cierra procesos ni cambia configuraciones.
- Debe distinguir observaciones de hipótesis y pedir permiso antes de proponer una acción sobre el equipo.
