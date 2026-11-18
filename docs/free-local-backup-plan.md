# Respaldos locales gratuitos: datos y web

## Estado
La interfaz de respaldo se ha añadido a la rama de trabajo, dentro del panel de propietario. No se ejecuta ninguna operación en Firebase hasta que el propietario pulsa el botón y confirma. No modifica ni borra documentos.

## Dos descargas independientes

### 1. Datos Firestore (JSON)
- Se ejecuta en el navegador con la sesión Firebase Auth ya iniciada.
- Comprueba el UID de propietario configurado.
- Lee las colecciones de primer nivel utilizadas por la aplicación: active_list, submissions, monthly_list, annual_list, artist_countries, voters_log, chat_users, chat_presence, private_artist_contacts, weekly_submitters, weekly_save_reviews, weekly_save_review_history, contact_messages, chat_messages, settings, backups y stats.
- Pagina por lotes de 300 documentos.
- Registra el recuento y el estado por colección; los errores de permisos quedan reflejados y la descarga se etiqueta como PARCIAL.
- La conversión JSON conserva marcadores explícitos para Timestamp, GeoPoint, DocumentReference y Bytes.
- El archivo se descarga localmente. No se envía a GitHub ni a otro servidor.

**Limitaciones:** el SDK web no permite descubrir automáticamente todas las colecciones de la base de datos ni recorrer subcolecciones arbitrarias. La lista anterior se obtuvo de las llamadas de colección de la aplicación y de las reglas propuestas. Esta copia no contiene subcolecciones, reglas, índices, configuración del proyecto ni metadatos internos del servicio. No es una exportación nativa de Firestore ni garantiza restauración exacta. Aunque todas las colecciones enumeradas se lean correctamente, se debe llamar "copia JSON de datos accesibles", no "backup completo/restaurable".

El archivo puede incluir correos, mensajes, IP históricas u otros datos personales. Debe guardarse en un dispositivo privado y no compartirse públicamente.

### 2. Código de la web (ZIP)
El segundo enlace descarga el archivo ZIP del repositorio GitHub desde la rama principal `main`. Incluye los archivos versionados del proyecto (código, recursos y documentación). No incluye datos privados de Firestore, credenciales, ni cambios que estén solo en una rama de trabajo o PR aún no fusionado. Es una copia del repositorio, no una exportación de Firebase Hosting.

## Condiciones de seguridad
- No se activa Blaze, facturación, Cloud Functions ni Cloud Storage.
- No se solicitan contraseñas, tokens, claves privadas ni archivos de cuenta de servicio.
- No se relajan las reglas de Firestore para permitir la descarga.
- Si una colección devuelve permission-denied, se conserva el error y se marca la copia como parcial.
- No se modifica ni elimina ningún documento.
- No se suben datos privados a GitHub.

## Criterio antes de usar en producción
La función está en una rama de trabajo y todavía no está publicada en la web principal. Antes de fusionar/desplegar hay que ejecutar las pruebas existentes y probar el botón con la cuenta propietaria, verificando que el JSON se descarga y que los estados de permisos son correctos. La descarga ZIP apunta a la rama principal, por lo que refleja solo lo que esté ya en `main`.
