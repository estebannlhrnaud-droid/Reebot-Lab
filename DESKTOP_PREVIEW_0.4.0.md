# REEBOT LAB v0.4.0 — Desktop Preview

Esta versión convierte la interfaz local en una aplicación de Windows. El launcher inicia los servicios privados y abre `REEBOT LAB Desktop.exe`, una ventana propia sin barra, pestañas ni navegación de navegador.

Al ejecutarse desde el paquete descargado, `REEBOT LAB.exe` solicita permiso para instalarse en `C:\Program Files\REEBOT LAB`, crea accesos directos y vuelve a abrir la copia instalada. La carpeta descargada deja de ser necesaria después de completar la instalación.

## REEBI

La IA y mascota oficial de REEBOT LAB se llama **REEBI**. El nombre aparece en la conversación, los diagnósticos, las alertas y la personalización.

## Funcionamiento local

- La UI y su código se descargan dentro del paquete de REEBOT LAB.
- El servidor interno escucha solamente en `http://localhost:3000`.
- La aplicación usa Microsoft WebView2 Evergreen, el motor ligero recomendado para aplicaciones nativas de Windows.
- Ollama y el agente permanecen en `127.0.0.1`.
- Si Ollama está apagado, REEBI conserva el análisis básico local.

## Inicio

1. Ejecuta `REEBOT LAB.exe` y acepta la instalación en Archivos de programa.
2. Abre REEBOT LAB desde el acceso directo.
3. Selecciona **INICIAR APP**.
4. El launcher prepara los componentes autorizados y abre la ventana de REEBOT LAB.

`ABRIR VERSIÓN WEB` continúa disponible como opción independiente.
