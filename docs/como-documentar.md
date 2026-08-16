# Cómo documentar esta app

Documentar no es copiar el código a un archivo. Es **explicar el producto a una persona** que mañana va a usarlo, venderlo o mantenerlo.

Si no has documentado nada antes: empieza por un área, en español, como se lo explicarías a alguien del equipo en 10 minutos. El resto se va llenando igual.

## 1. Decide para quién escribes

En este CRM hay tres lectores. No mezcles los tres en el mismo documento.

| Lector | Qué necesita | Ejemplo |
| --- | --- | --- |
| **Cliente / dueños** | Confianza y panorama. Casi cero técnica. | [seguridad.md](./seguridad.md) |
| **Equipo que usa la app** | Qué hace cada pantalla, paso a paso, y qué no hay que tocar. | “Cómo crear una cotización” |
| **Quien configura o desarrolla** | Variables, Google, Firebase, reglas que no se pueden romper. | README de la raíz |

Una regla práctica: si una frase solo la entiende quien abrió el código, ese párrafo no va en el documento del equipo.

## 2. Un tema por archivo

No hagas un solo PDF de 40 páginas. En esta carpeta, **un archivo = un área de la app**.

Así se parece al menú de la izquierda:

- Dashboard
- Proyectos
- Clientes
- Materiales
- Cotizador
- Nuevo lead / proyecto
- Papelera
- Google (Calendar, Drive, Tasks)
- Seguridad (ya está)

Si un documento pasa de ~3 páginas, suele ser que se mezclaron dos temas. Sepáralos.

## 3. Plantilla de cada documento de uso

Copia esto y rellénalo. No hace falta inventar otra estructura.

```markdown
# Nombre del área

En una frase: para qué sirve esta pantalla.

## Qué puedes hacer aquí
- Lista corta de acciones reales (crear, buscar, exportar…).

## Cómo se usa
Paso a paso de lo más frecuente. Capturas solo si un paso se confunde sin ellas.

## Reglas que hay que respetar
Lo que la app no deja hacer, o que es irreversible.
Ejemplo: “una cotización solo se puede borrar las primeras 48 horas”.

## Errores frecuentes
Qué significa el mensaje y qué hacer. 3–5 casos basta.

## Relación con otras áreas
“Este proyecto vive bajo un cliente. Si combinas clientes, las carpetas de Drive se mueven.”
```

Eso es un documento terminado. No hace falta listar cada botón.

## 4. En qué orden documentar Studio360

Hazlo en el mismo orden en que alguien aprendería el negocio, no en el orden del código:

1. **Seguridad** — ya está, sirve para el cliente.
2. **Nuevo lead / proyecto** — de dónde salen los registros.
3. **Clientes** — ficha, alta, combinar.
4. **Proyectos** — Kanban, cierre, seguimientos, Google Tasks.
5. **Cotizador** — crear, clonar, PDF, subir a Drive.
6. **Materiales** — lista y precios que usa el cotizador.
7. **Papelera** — 30 días, restaurar, borrar definitivo (solo admin).
8. **Dashboard** — qué significa cada número.
9. **Google** — Calendar, Drive, Tasks: qué hace cada uno y qué hay que tener configurado.

Marca cada uno como **Pendiente → Listo** en [README.md](./README.md) de esta carpeta.

## 5. Cómo trabajarlo con el asistente (sin tener que escribirlo todo a mano)

No tienes que redactarlo tú desde cero. Un flujo que funciona:

1. Abre el área en la app (por ejemplo Clientes).
2. En el chat: **“Documenta el área de Clientes para el equipo, en `docs/clientes.md`, siguiendo `docs/como-documentar.md`.”**
3. Revisa el texto como si se lo vieras a una persona nueva del equipo. Si algo suena a código, pídele que lo reescriba.
4. Actualiza la tabla del índice: pasa ese documento a **Listo**.

Un área por conversación. Si pides “documenta toda la app” de una vez, el resultado sale genérico y se desactualiza peor.

Cuando cambies una función, el mensaje corto es: **“Actualiza `docs/cotizador.md`: ahora se puede subir el PDF a Drive sin descargarlo.”**

## 6. Qué no documentar

- Nombres de archivos, funciones o rutas internas (salvo el documento técnico).
- Cada estado posible de un formulario.
- Capturas de cada pantalla. Solo las 1 o 2 donde la gente se pierde.
- Secretos: nunca pegues claves, `.env` ni IDs de cuentas de servicio.

## 7. Señal de que está bien hecho

Alguien del equipo, sin verte, puede:

- entrar a la app
- crear un cliente y un proyecto
- armar una cotización y subirla a Drive
- saber qué no debe tocar (combinar, vaciar papelera)

Si eso se puede seguir con los documentos de `docs/`, la fase de documentación está cumplida. El resto es ir actualizando cuando cambie el producto.
