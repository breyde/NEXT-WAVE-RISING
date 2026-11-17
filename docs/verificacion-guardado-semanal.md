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
