# REEBOT LAB

> Tu PC, por fin entendible.

REEBOT LAB es un compañero inteligente y open source para Windows que permite conversar con tu PC, entender su rendimiento, diagnosticar problemas y encontrar soluciones mediante experimentos guiados, manteniendo siempre al usuario en control.

## Estado

El proyecto está en **Early Access**. La interfaz y la telemetría local ya funcionan como prototipo; el chat inteligente, los permisos avanzados y los experimentos reales continúan en desarrollo.

## Funciones actuales

- Monitor local de CPU, RAM, discos y procesos.
- Interfaz oficial responsive de REEBOT LAB.
- Mascota con estados de ánimo.
- Perfiles Gaming, Estudio, Chill y Movie.
- Chat demostrativo con explicaciones contextuales.
- Propuesta de experimentos guiados.
- Vistas de procesos, laboratorio y personalización.

## Arquitectura

- **UI:** React 19, TypeScript, Tailwind CSS y vinext/Vite.
- **Telemetría:** PowerShell y CIM/WMI de Windows.
- **Comunicación local:** HTTP en `127.0.0.1:47831`.
- **Plataforma inicial:** Windows.

## Requisitos de desarrollo

- Windows 10 u 11.
- Node.js 22.13 o superior.
- PowerShell 5.1 o superior.

## Inicio rápido

```powershell
npm install
npm run dev
```

Para iniciar también la telemetría local, ejecuta:

```powershell
.\start-reebot-lab.cmd
```

La interfaz estará disponible en `http://localhost:3000`.

## Compilación

```powershell
npm run build
```

## Principios del producto

- La configuración pertenece al usuario.
- Reebot pide permiso antes de acceder o cambiar algo.
- Los experimentos restauran el estado anterior al terminar.
- Los datos permanecen localmente salvo autorización explícita.
- La aplicación explica antes de recomendar.

## Participar

Puedes abrir issues para reportar errores, compartir ideas o proponer experimentos. Antes de publicar diagnósticos, elimina nombres, rutas y cualquier dato personal.

## Licencia

La licencia open source se definirá antes de la primera versión pública estable.
