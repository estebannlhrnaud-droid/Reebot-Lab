# REEBOT LAB

> Tu PC, por fin entendible.

REEBOT LAB es un compañero inteligente y open source para Windows que permite conversar con tu PC, entender su rendimiento, diagnosticar problemas y encontrar soluciones mediante experimentos guiados, manteniendo siempre al usuario en control. Su IA y mascota se llama **REEBI**.

## Estado

El proyecto está en **Early Access**. La interfaz, la telemetría local, el agente de vinculación, el chat con Ollama y las primeras optimizaciones reversibles ya funcionan. Las acciones avanzadas continúan en desarrollo.

## Funciones actuales

- Monitor local con refresco de 1 s para CPU, GPU, temperatura, VRAM, RAM, discos y procesos.
- Relojes CPU/GPU en una barra `BASE · BOOST · XOC`, referencias oficiales y offset exacto cuando NVIDIA App o MSI Afterburner exponen el OC.
- Gráfica GPU/VRAM combinada e identificación del proceso que más memoria de video utiliza.
- Interfaz responsive con estados semánticos y avisos automáticos.
- Mapa físico interactivo: CPU, GPU, RAM y almacenamiento abren su panel técnico directamente desde el diagrama del gabinete.
- REEBI 2D con animaciones automáticas de reposo, análisis, alerta, saludo y celebración conectadas al estado del equipo.
- Dashboard modular con tamaños S/M/L y niveles de detalle Esencial, Equilibrio y Técnico guardados en la PC.
- Perfiles Gaming, Studio, Chill y Movie con acentos visuales propios.
- Chat local con Ollama, historial breve y contexto de métricas.
- Consola directa para conversar con `qwen3.5:9b` sin pasar por la interfaz web.
- Agente local con código de vinculación para conectar la versión publicada.
- Modo básico de respaldo cuando el modelo no está activo.
- Vistas de procesos, laboratorio y personalización.
- Análisis híbrido de procesos: Windows filtra candidatos seguros y REEBI los ordena y explica.
- Acciones directas con doble validación: bajar prioridad, pausar cinco minutos y deshacer.
- Actualizador incremental: desde v0.5 descarga parches verificados desde GitHub Releases y conserva la versión anterior como respaldo; v0.6 incluye parches para la versión pública v0.4 y el preview v0.5.

## Arquitectura

- **UI:** React 19, TypeScript y vinext/Vite.
- **Agente local:** PowerShell, HTTP en `127.0.0.1:47831` y vinculación mediante token.
- **Telemetría:** CIM/WMI de Windows y `nvidia-smi`.
- **IA local:** Ollama con `qwen3.5:9b` como modelo recomendado.
- **Motor de acciones:** lista cerrada de cambios reversibles, validación de identidad del proceso y registro local.
- **Canal de actualización:** GitHub Releases, paquetes delta y verificación SHA-256 antes de instalar.
- **Plataforma inicial:** Windows.

## Requisitos de desarrollo

- Windows 10 u 11.
- Node.js 22.13 o superior.
- PowerShell 5.1 o superior.
- Ollama para usar el chat inteligente local.

## Inicio rápido local

La forma recomendada en Windows es abrir `REEBOT LAB.exe`. En el primer inicio, el launcher pide permiso para instalar la aplicación en `C:\Program Files\REEBOT LAB` y crea accesos directos en Inicio y el escritorio. Los componentes modificables se guardan en `%LOCALAPPDATA%\REEBOT LAB`, evitando depender de la carpeta Descargas y evitando permisos de administrador en cada inicio.

Después de instalarse, el launcher comprueba Node.js, el agente local y Ollama y abre la interfaz dentro de **REEBOT LAB Desktop**, no en el navegador. El servicio interno escucha solamente en `localhost`. Si falta Node.js, ofrece instalarlo con `winget`; la primera instalación de dependencias siempre pide confirmación. `REEBOT_LAB_LAUNCHER.cmd` permanece como alternativa técnica.

```powershell
npm ci
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
- La IA nunca recibe una terminal libre: sólo puede proponer acciones incluidas en la lista segura del agente.

## IA local

Consulta [LOCAL_AI.md](./LOCAL_AI.md) para instalar Ollama, descargar el modelo y entender los límites actuales.

REEBOT cambia automáticamente a **ANÁLISIS BÁSICO LOCAL** si Ollama está apagado. La interfaz, la telemetría, los perfiles y los diagnósticos por reglas continúan funcionando; al volver a iniciar Ollama, la app recupera `qwen3.5:9b` sin reconfiguración.

## Participar

Puedes abrir issues para reportar errores, compartir ideas o proponer experimentos. Antes de publicar diagnósticos, elimina nombres, rutas y cualquier dato personal.

## Licencia

La licencia open source se definirá antes de la primera versión pública estable.
