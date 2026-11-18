# Cómo publicar "Mi presupuesto diario" gratis

Vas a usar dos servicios gratuitos:

- **Firebase** (de Google): guarda los datos de cada persona y maneja el "Entrar con Google".
- **GitHub Pages**: publica la app en internet con una dirección como `https://tuusuario.github.io/presupuesto/`.

No necesitas tarjeta de crédito ni instalar programas. Hazlo desde un computador; toma más o menos una hora la primera vez.

Antes de empezar, **descomprime el archivo .zip**. Debes ver estos archivos: `index.html`, `app.js`, `engine.js`, `ahorros.js`, `prestamos.js`, `clave.js`, `favicon.ico`, `firebase-config.js`, `sw.js`, `manifest.webmanifest`, `firestore.rules`, esta guía y una carpeta `icons`.

> **¿Ya habías publicado la versión anterior?** Ve directo a la sección *Actualizar a una versión nueva* al final.

---

## Paso 1. Crear el proyecto en Firebase

1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. Toca **Crear un proyecto** (o "Agregar proyecto").
3. Ponle un nombre, por ejemplo `mi-presupuesto`, y continúa.
4. Cuando te pregunte por **Google Analytics**, desactívalo (no lo necesitas) y toca **Crear proyecto**.
5. Espera a que termine y toca **Continuar**.

Tu proyecto queda en el **plan Spark**, que es el gratuito. **Nunca lo cambies al plan Blaze**: ese pide tarjeta y podría cobrar. En Spark, si algún día se llega al límite gratis, la app solo deja de guardar hasta el día siguiente; nunca te cobra.

## Paso 2. Activar "Entrar con Google"

1. En el menú de la izquierda abre **Compilación → Authentication** y toca **Comenzar**.
2. En la pestaña **Método de acceso**, elige **Google**.
3. Activa el interruptor **Habilitar**, elige tu correo en "Correo electrónico de asistencia" y toca **Guardar**.

## Paso 3. Crear la base de datos y protegerla

1. En el menú de la izquierda abre **Compilación → Firestore Database** y toca **Crear base de datos**.
2. Ubicación: elige **southamerica-east1 (São Paulo)**, que es la más cercana a Colombia. Esto no se puede cambiar después.
3. Elige **Iniciar en modo de producción** y toca **Crear**.
4. Cuando cargue, entra a la pestaña **Reglas**.
5. Borra todo lo que hay en el cuadro de texto. Abre el archivo `firestore.rules` (con el Bloc de notas o cualquier editor de texto), copia todo su contenido y pégalo en el cuadro.
6. Toca **Publicar**.

Estas reglas hacen que cada persona solo pueda ver y modificar sus propios datos.

## Paso 4. Registrar la app web y copiar la configuración

1. Arriba a la izquierda toca el **engranaje ⚙ → Configuración del proyecto**.
2. Baja hasta **Tus apps** y toca el ícono **`</>`** (Web).
3. Ponle un apodo, por ejemplo `presupuesto-web`. **No** marques "Firebase Hosting". Toca **Registrar app**.
4. Te muestra un bloque de código con `const firebaseConfig = { ... }`. Déjalo abierto en esa pestaña: lo vas a copiar en el Paso 6.

(Si cierras esa pantalla, lo encuentras de nuevo en Configuración del proyecto → Tus apps → SDK setup and configuration → Config.)

## Paso 5. Subir la app a GitHub

1. Entra a **https://github.com** y crea una cuenta gratis (o inicia sesión). Tu nombre de usuario será parte de la dirección de la app.
2. Arriba a la derecha toca **+ → New repository**.
3. En "Repository name" escribe `presupuesto`.
4. Elige **Public** (en la cuenta gratis, las páginas solo funcionan con repositorios públicos; lo que queda público es el código de la app, **no** los datos de las personas, que están en Firebase).
5. Toca **Create repository**.
6. En la página que aparece, toca el enlace **uploading an existing file**.
7. Arrastra **todos los archivos y la carpeta `icons`** (lo que está dentro de la carpeta que descomprimiste, no la carpeta completa) al recuadro.
8. Espera a que suban y toca **Commit changes**.

## Paso 6. Pegar tu configuración de Firebase

1. En tu repositorio de GitHub, toca el archivo **firebase-config.js**.
2. Toca el ícono del **lápiz ✏** (Edit this file).
3. Reemplaza cada `PEGA_AQUI` con el valor correspondiente que te mostró Firebase en el Paso 4. Debe quedar así (con tus valores):

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "mi-presupuesto-xxxxx.firebaseapp.com",
  projectId: "mi-presupuesto-xxxxx",
  storageBucket: "mi-presupuesto-xxxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

4. Toca **Commit changes** (dos veces si te lo vuelve a preguntar).

Tranquilo: estos valores **no son contraseñas**. Están hechos para ir dentro de la app; la seguridad la dan las reglas del Paso 3.

## Paso 7. Encender GitHub Pages

1. En tu repositorio toca **Settings** (arriba) y luego **Pages** (menú de la izquierda).
2. En "Source" elige **Deploy from a branch**.
3. En "Branch" elige **main** y la carpeta **/ (root)**. Toca **Save**.
4. Espera 1 o 2 minutos y recarga. Arriba aparece: *Your site is live at* **https://tuusuario.github.io/presupuesto/**. Esa es la dirección de tu app.

## Paso 8. Autorizar tu dirección en Firebase

Sin este paso, el botón de Google muestra un error.

1. Vuelve a Firebase → **Authentication → Configuración** (Settings) → **Dominios autorizados**.
2. Toca **Agregar dominio** y escribe solo `tuusuario.github.io` (sin `https://` y sin `/presupuesto`).
3. Toca **Agregar**.

## Paso 9. Probar e instalar

1. Abre tu dirección `https://tuusuario.github.io/presupuesto/` y toca **Entrar con Google**.
2. Llena un ingreso y un gasto, cierra la página y vuelve a abrirla en otro dispositivo con la misma cuenta: debes ver lo mismo.
3. Para instalarla como app:
   - **Android (Chrome):** menú ⋮ → **Instalar app** o **Agregar a la pantalla principal**.
   - **iPhone (Safari):** botón **Compartir** → **Agregar a inicio**.
   - **Computador (Chrome o Edge):** ícono de instalar en la barra de direcciones, o en la app: tu foto → **Instalar la app**.

¡Listo! Comparte la dirección con quien quieras. Cada persona entra con su propia cuenta de Google y ve solo su información.

---

## Si algo falla

| Lo que ves | Qué hacer |
|---|---|
| "Falta conectar Firebase" | Revisa el Paso 6: falta reemplazar algún `PEGA_AQUI` en `firebase-config.js`. |
| "Esta dirección no está autorizada en Firebase" | Haz el Paso 8. |
| "Tu navegador bloqueó la ventana de Google" | Permite ventanas emergentes para tu dirección en el navegador. |
| "No se pudieron cargar tus datos" | Revisa que publicaste las reglas del Paso 3 y que hay internet. |
| En iPhone, la app instalada no deja entrar con Google | Ábrela desde Safari en vez del ícono instalado. Es una limitación de Apple con las ventanas de inicio de sesión en apps instaladas desde el navegador. |
| Hiciste un cambio y no se ve | Cierra y abre la app. Si sigue igual, en `sw.js` cambia `presupuesto-v1` por `presupuesto-v2` (y así cada vez que cambies algo). |

## Límites gratis (plan Spark)

- Cuentas registradas: ilimitadas. Hasta unas 3.000 personas activas por día.
- Base de datos: 1 GB, 50.000 lecturas y 20.000 escrituras por día. Cada persona usa muy poco: la app guarda cada cambio después de un segundo y medio y agrupa varios cambios en uno.
- GitHub Pages: gratis para repositorios públicos.

Estos límites los fija Google y GitHub y pueden cambiar con el tiempo. En **Firebase → Uso y facturación** puedes ver cuánto se está usando.

## Sobre la privacidad de tus usuarios

- Desde la app, nadie puede ver los datos de otra persona.
- Tú, como dueño del proyecto, **sí podrías** verlos en la consola de Firebase (Firestore Database → Datos). Sé transparente con tus usuarios y no entres a revisarlos.
- En Colombia, la Ley 1581 de 2012 protege los datos personales. Si vas a compartir la app con muchas personas, conviene publicar un aviso corto de privacidad que diga qué datos se guardan (nombre y correo de Google y la información financiera que cada quien escribe), para qué se usan y que cada persona puede borrarlos (en la app: tu foto → **Borrar todos mis datos**).

## Actualizar a una versión nueva

1. En tu repositorio de GitHub toca **Add file → Upload files** y arrastra los archivos nuevos (todos menos `firebase-config.js`, para no perder tu configuración). GitHub reemplaza los que tienen el mismo nombre. Toca **Commit changes**.
2. Si la versión nueva trae un `firestore.rules` distinto, pégalo otra vez en Firebase → Firestore Database → Reglas → **Publicar** (Paso 3). Las reglas no cambian desde la versión con tarjetas y créditos.
3. Espera un par de minutos, cierra la app y ábrela de nuevo.

## Cómo calcula la app tus deudas

**Dos clases de crédito:**

- **Rotativos** (pestaña *Tarjetas y cupos*): tienes un cupo. Lo que pagas se libera y lo puedes volver a usar. Aquí van las tarjetas de crédito, los créditos rotativos y los cupos de almacén o apps (Sistecrédito, por ejemplo). Aunque debas $0, la tarjeta sigue activa.
- **De cuotas o no rotativos** (pestaña *Créditos*): te prestan una sola vez y lo pagas en cuotas. Lo que pagas no se vuelve a usar. Aquí van libre inversión, libranza, vehículo, vivienda, estudio, celular financiado y compras a cuotas. Cuando el saldo llega a $0, el crédito termina.

**La cuenta mes a mes** (igual que la lleva el banco):

*saldo nuevo = saldo anterior + compras o desembolsos nuevos + intereses + manejo o seguro − lo que pagaste*

- Los intereses se calculan sobre lo que debes de verdad, no sobre un plan fijo. Si abonas de más, pagas menos intereses y terminas antes (se reduce el plazo).
- **Te toca pagar** = lo que corresponde según las cuotas de tus compras o del crédito, más los intereses, el manejo o seguro y lo que quedó sin pagar el mes anterior. Nunca es más de lo que debes en total.
- Si pagas menos de lo que te tocaba, lo que falta pasa al mes siguiente como **atrasado**. Los intereses de mora no se calculan: revisa tu extracto si te atrasas.
- Cuando el saldo llega a $0, ya no te pide más cuotas aunque el plan original dijera otra cosa.

**Estados que reconoce:**

| Estado | Qué significa |
|---|---|
| Al día ✔ / Pendiente / En mora / Atrasado | Si pagaste lo que te tocaba este mes. "En mora" = este mes, con algo atrasado del anterior. "Atrasado" = un mes que ya pasó sin pagar completo. |
| En uso | Tarjeta o cupo con saldo pendiente. |
| Al día (la usaste y pagaste) | La usaste y ya no debes nada. |
| Al día, sin uso | No la usas y no debes compras. Si te cobra manejo igual, la app te avisa para que pidas exoneración o la canceles. |
| Activo | Crédito de cuotas con saldo pendiente. |
| Pagado ✔ / Cerrado | Lo terminaste de pagar este mes / en un mes anterior. Pide el paz y salvo. |
| Plazo vencido | Ya pasó la última cuota y aún debes: todo el saldo está vencido. |

**Evaluación:**

- Cuándo terminas de pagar cada deuda y cuántos intereses te faltan.
- Si escribes un abono extra mensual, cuánto antes terminas y cuánto te ahorras.
- En qué orden abonar: primero la de tasa más alta.
- Alertas: atrasos, uso del cupo mayor al 30%, cupo sobregirado, saldo a favor.

**Desde cuándo:** la app revisa tus pagos desde el mes que elijas en *Comparar meses* (en el Excel, en Configuración). Antes de ese mes supone que pagaste lo que te tocaba.

## Cómo pasan los meses y dónde quedan tus datos

- **La app crea el mes nuevo sola.** Cuando la abres en un mes nuevo, copia tus ingresos y gastos fijos del mes anterior y te avisa. Los meses anteriores quedan guardados tal como estaban, y los comparas en *Comparar meses*.
- **Tarjetas, créditos, pagos, ahorros y metas no son de un mes:** se guardan aparte y siguen solos. Las cuotas avanzan, los ahorros rinden y las metas se actualizan.
- **Dónde se guardan:** en tu cuenta de Google, dentro de la base de datos de Firebase. Ves lo mismo en cualquier celular o computador, y si no hay internet la app guarda en el teléfono y sube los cambios cuando vuelve la conexión.
- **Copia:** en tu foto → *Descargar mis datos (CSV)*.

## Ahorros y metas

- **Cada ahorro** (cuenta, cajita o bolsillo, CDT, fondo) lleva fecha de apertura, con cuánto lo abriste y rendimiento E.A. Registra lo que metes o sacas y la app calcula:
  - cuánto tienes;
  - cuánto has metido;
  - cuánto has ganado;
  - cuánto tendrías en 3, 6, 9 y 12 meses con tu aporte planeado.
- **Rendimientos:** se calculan por días, con la tasa E.A.
- **CDT:** se crea con su valor y su plazo. Muestra cuándo vence y cuánto recibirás, ya descontada la retención en la fuente (en Colombia suele ser el 4% de los rendimientos). Deja de crecer al vencer.
- **Si el saldo no coincide con tu banco,** escribe el saldo real y su fecha: la app parte de ahí.
- **Metas:** carro, cuota inicial de vivienda, fondo de emergencia, viaje… Escribes cuánto cuesta, qué porcentaje necesitas ahorrar (por ejemplo, 30% para la cuota inicial de una vivienda) y para cuándo, y eliges qué cuentas suman para esa meta. Ves:
  - el porcentaje de avance;
  - cuánto te falta;
  - cuánto debes ahorrar al mes para llegar a tiempo;
  - en qué mes llegarías a tu ritmo actual;
  - un gráfico de cómo crece tu ahorro frente a la meta.

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página y su diseño. |
| `app.js` | Pantallas y guardado. |
| `engine.js` | Los cálculos de tarjetas y créditos (cuotas, intereses, pago mínimo, lo que debes). |
| `ahorros.js` | Los cálculos de ahorros, CDT y metas. |
| `prestamos.js` | Los cálculos de préstamos con personas (le debo / me deben). |
| `clave.js` | La clave de acceso opcional y su teclado (solo guarda un código cifrado, nunca la clave). |
| `firebase-config.js` | La conexión con tu proyecto de Firebase (lo único que debes editar). |
| `firestore.rules` | Las reglas de seguridad que pegas en Firebase (no hace falta subirlo a GitHub, pero no estorba). |
| `sw.js` | Permite que la app abra sin internet y se instale. |
| `manifest.webmanifest` e `icons/` | Nombre, colores, íconos y logo de la app (`icons/logo.svg` es la hormiga con la moneda). |
