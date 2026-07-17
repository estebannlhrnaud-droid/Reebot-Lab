# REEBOT LAB

> Tu PC, por fin entendible.

REEBOT LAB es un compañero inteligente y open source para Windows que permite conversar con tu PC, entender su rendimiento, diagnosticar problemas y encontrar soluciones mediante experimentos guiados, manteniendo siempre al usuario en control.

## Estado

El proyecto está en **Early Access**. La interfaz, la telemetría local, el agente de vinculación y el chat con Ollama ya funcionan como prototipo. Los permisos avanzados y los experimentos que ejecutan acciones reales continúan en desarrollo.

## Funciones actuales

- Monitor local de CPU, GPU, temperatura, VRAM, RAM, discos y procesos.
- Interfaz responsive con estados semánticos y avisos automáticos.
- Mascota interactiva conectada al estado del equipo.
- Perfiles Gaming, Studio, Chill y Movie con acentos visuales propios.
- Chat local con Ollama, historial breve y contexto de métricas.
- Agente local con código de vinculación para conectar la versión publicada.
- Modo básico de respaldo cuando el modelo no está activo.
- Vistas de procesos, laboratorio y personalización.

## Arquitectura

- **UI:** React 19, TypeScript y vinext/Vite.
- **Agente local:** PowerShell, HTTP en `127.0.0.1:47831` y vinculación mediante token.
- **Telemetría:** CIM/WMI de Windows y `nvidia-smi`.
- **IA local:** Ollama con `qwen3.5:9b` como modelo recomendado.
- **Plataforma inicial:** Windows.

## Requisitos de desarrollo

- Windows 10 u 11.
- Node.js 22.13 o superior.
- PowerShell 5.1 o superior.
- Ollama para usar el chat inteligente local.

## Inicio rápido local

La forma recomendada es abrir `REEBOT_LAB_LAUNCHER.cmd`. El launcher comprueba Node.js, el agente local y Ollama; muestra el código de vinculación y permite abrir la interfaz local o la versión web. Si falta Node.js, ofrece instalarlo con `winget`; la primera instalación de dependencias siempre pide confirmación.

```powershell
npm install
.\start-reebot-lab.cmd
```

La interfaz local estará disponible en `http://localhost:3000`.

## Conectar la versión publicada

1. Abre `START_REEBOT_AGENT.cmd` y mantén la ventana abierta.
2. Copia el código de seis dígitos que muestra el agente.
3. En la página publicada entra a **Ajustes**.
4. Escribe el código y selecciona **Vincular**.

El token queda guardado únicamente en ese navegador. El agente acepta solicitudes sólo desde la interfaz local y el dominio publicado de REEBOT LAB. Puedes revocar la vinculación desde Ajustes.

## Compilación

```powershell
npm run build
```

## Principios del producto

- La configuración pertenece al usuario.
- REEBOT pide permiso antes de acceder o cambiar algo.
- Los experimentos deben restaurar el estado anterior al terminar.
- Las métricas y conversaciones con Ollama permanecen en la PC.
- La aplicación explica antes de recomendar.

## IA local

Consulta [LOCAL_AI.md](./LOCAL_AI.md) para instalar Ollama, descargar el modelo y entender los límites actuales.

## Participar

Puedes abrir issues para reportar errores, compartir ideas o proponer experimentos. Antes de publicar diagnósticos, elimina nombres, rutas y cualquier dato personal.

## Licencia

La licencia open source se definirá antes de la primera versión pública estable.
