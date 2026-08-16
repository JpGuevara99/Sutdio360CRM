# Medidas de seguridad — Studio360 CRM

Documento para el cliente y los dueños de la empresa. Describe cómo está protegida la aplicación hoy.

La app está pensada para **uso interno del equipo**. Nadie ajeno a la empresa puede entrar, y las acciones más delicadas están reservadas a administradores.

## Quién puede entrar

- Acceso solo con **cuenta de Google Workspace** de la empresa.
- Solo se aceptan correos del **dominio de la empresa**. Si esa lista no está configurada, nadie entra.
- No hay registro público ni contraseñas propias de la app: se usa la cuenta Google de cada persona.
- Al cerrar la sesión, se invalida el acceso en el servidor.

## Qué ve y qué puede hacer cada persona

- Todas las pantallas y las peticiones al servidor exigen **sesión activa**. Sin iniciar sesión no se muestran datos.
- El equipo puede trabajar con clientes, proyectos y cotizaciones.
- Las acciones irreversibles las puede hacer **solo un administrador**:
  - combinar clientes
  - eliminar un cliente
  - vaciar la papelera o restaurarla por completo
  - borrar etapas del pipeline
  - cambiar ajustes globales (empresa y seguimientos)

## Datos y archivos

- La información no se consulta desde el navegador directo a la base de datos: **todo pasa por el servidor**.
- Los archivos de Google Drive que muestra la app son **solo los del CRM**, no el Drive personal ni de otros proyectos.
- Hay **límite de tamaño** al subir archivos (25 MB) y se bloquean tipos peligrosos (páginas web, ejecutables, etc.).
- Los PDF e imágenes se pueden ver en la app; el resto se **descarga**, para que nada se ejecute en el navegador.

## Protección de la conexión

- La sesión viaja en una cookie que el navegador **no puede leer** con JavaScript.
- En producción se fuerza conexión segura (**HTTPS**).
- El navegador recibe reglas extra: la app no se puede incrustar en otros sitios y se limita de dónde puede cargar contenido.
- Hay un **límite de peticiones por minuto**, para que un abuso o un error no sature el sistema.

## Trazabilidad

Queda registro de quién hizo estas acciones, y cuándo:

- combinar clientes
- enviar un cliente o proyecto a la papelera
- restaurar o borrar de forma definitiva
- cambiar configuraciones

## Integraciones de Google

- Calendar, Drive y Tasks se conectan con una **cuenta de servicio de la empresa**, no con las cuentas personales del equipo.
- La papelera también aplica a las **carpetas de Drive** asociadas: se conservan un tiempo (30 días) y luego se descartan.

---

*Última actualización: agosto 2026.*
