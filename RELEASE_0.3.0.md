# REEBOT LAB v0.3.0 — Early Access

REEBOT LAB `0.3.0` incorpora un launcher ejecutable para Windows, reparación automática de dependencias, acceso directo a la IA local y telemetría en tiempo real.

La aplicación cambia automáticamente entre dos motores:

- **IA local:** Ollama con `qwen3.5:9b` cuando el servidor está disponible.
- **Análisis básico:** diagnóstico por reglas locales cuando Ollama está apagado, no está instalado o deja de responder.

## Inicio

1. Descarga y descomprime el ZIP de Windows.
2. Ejecuta `REEBOT LAB.exe`.
3. Selecciona **INICIAR EN LOCAL**.
4. REEBOT pedirá permiso antes de instalar Node.js o preparar dependencias.
5. Usa **CONSOLA IA** para conversar directamente con `qwen3.5:9b`.

También puedes ejecutar `OPEN_REEBOT_AI.cmd` para abrir la IA sin iniciar la interfaz completa.

## Servicios locales

- Interfaz: `http://localhost:3000`
- Ollama: `http://127.0.0.1:11434`
- Agente y telemetría: `http://127.0.0.1:47831`

Los tres servicios escuchan únicamente en la PC. REEBOT no expone Ollama directamente a internet. La versión web utiliza el agente local y requiere un código temporal de vinculación.

## Aviso de Windows

El ejecutable Early Access todavía no tiene firma digital. Si SmartScreen aparece, comprueba que el archivo proviene de la release oficial de REEBOT LAB antes de seleccionar **Más información → Ejecutar de todas formas**.
