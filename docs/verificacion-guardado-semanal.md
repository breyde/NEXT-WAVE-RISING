# Verificación gratuita del guardado semanal

## Objetivo
Añadir al flujo de inscripción semanal un control manual y transparente del compromiso de guardar la playlist. Esta propuesta no utiliza Firebase Cloud Functions, Blaze, servicios de pago ni nuevas credenciales.

## Límites conocidos
- Spotify Web API en modo de desarrollo solo permite autorizar hasta cinco usuarios de prueba. No se debe intentar eludir ese límite.
- GitHub Pages es alojamiento estático: no puede guardar secretos ni verificar por sí solo la biblioteca privada de Spotify.
- Marcar una casilla no equivale a una verificación de Spotify.
- No se deben publicar capturas, correos ni pruebas privadas en una colección Firestore de lectura pública.

## Estados que mostrará el panel de administración
1. **Declarado por el participante**: marcó la casilla; todavía no se ha revisado ninguna prueba.
2. **Pendiente de revisión**: el participante ha avisado de que ha enviado una prueba por un canal privado acordado.
3. **Revisado manualmente**: el administrador ha comprobado la prueba fuera de la web.
4. **No acreditado**: la prueba no permite confirmar el guardado.

Ninguno de estos estados debe llamarse «Verificado por Spotify». Ese nombre se reserva exclusivamente para una comprobación real realizada por la API de Spotify con autorización válida del propio usuario.

## Registro e historial
- Cada registro debe identificar la edición semanal, el participante y la fecha del cambio de estado.
- Los cambios deben conservarse en un historial independiente de la cola semanal, para que no desaparezcan cuando se rote la lista.
- El estado de una edición no debe modificar las listas mensual/anual ni ejecutar rotaciones.
- No se guardarán capturas ni enlaces públicos a pruebas privadas en Firestore. El administrador revisará la evidencia mediante un canal privado y marcará el resultado en el panel.

## Requisitos antes de tocar la web publicada
1. Revisar las reglas actuales de Firestore y confirmar que solo el administrador autenticado puede cambiar estados e historial.
2. Definir un canal privado de recepción de pruebas; no pedir a los participantes que publiquen capturas con datos personales.
3. Implementar el panel y probarlo con datos ficticios en una rama separada.
4. Comprobar que la rotación semanal conserva el historial y que las listas mensuales/anuales y la sincronización de Spotify no cambian.
5. Solo después de superar las pruebas, decidir si se integra en `main`.

## Alcance de esta rama
Esta rama contiene únicamente la especificación. No cambia `index.html`, Firebase, las reglas de Firestore, las listas, GitHub Actions ni la web publicada. No se ha desplegado nada ni se ha activado facturación.


## Auditoría inicial del repositorio (18-11-2026)
- La rama `main` no contiene `firebase.json` ni `firestore.rules`; tampoco aparecen en el árbol de archivos versionados.
- `index.html` inicializa Firebase en el navegador y accede directamente a Firestore.
- El formulario público crea documentos en `submissions` y `contact_messages`.
- El panel de curadores usa Firebase Authentication para iniciar sesión. Esto, por sí solo, no protege las escrituras: las reglas de Firestore deben validar los permisos en el servidor.
- Las reglas activas del proyecto no se pueden deducir del código del navegador ni de que el panel oculte botones. Deben revisarse en Firebase Console antes de añadir una colección de historial o permitir cambios de estado.
- La automatización existente de GitHub Actions tiene horarios programados y pasos de sincronización Spotify. No se ha ejecutado ni modificado durante esta revisión.

## Resultado de la auditoría
**Bloqueado para implementación en Firestore hasta revisar las reglas activas.** No crear todavía colecciones, documentos ni escrituras para los estados de revisión. No modificar las colecciones existentes ni la automatización.


## Hallazgo adicional: autenticación del panel (18-11-2026)
La revisión de `index.html` en `main` confirma que:
- El panel se muestra para cualquier usuario que dispare `auth.onAuthStateChanged` con una sesión válida.
- El inicio de sesión utiliza `signInWithEmailAndPassword`, pero el código no comprueba un rol administrativo específico ni una lista autorizada de UID.
- Por tanto, las reglas actuales que usan únicamente `request.auth != null` no distinguen al curador de cualquier otra cuenta autenticada.
- La comprobación visual del panel en el navegador no constituye una barrera de seguridad. La autorización debe aplicarse en reglas Firestore mediante una identidad/rol administrativo verificable en el servidor (por ejemplo, custom claims administrados de forma segura) o una alternativa equivalente.

**Acción requerida antes de implementar:** definir cómo se asigna y verifica el rol de curador sin confiar en valores editables por el cliente. No basta con comprobar que hay un correo o una sesión activa. No se ha cambiado el código de producción ni las reglas publicadas.
