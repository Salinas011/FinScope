# Finanza v2 — Dashboard de Finanzas Personales (Arquitectura Modular y Escalable)

Aplicación web de finanzas personales diseñada con altos estándares de ingeniería de software, arquitectura modular limpia (Clean Architecture), diseño responsivo de primer nivel y almacenamiento local persistente con migración automática de esquemas.

> **Zero-Configuración:** Funciona directamente abriendo `index.html` con la extensión **Live Server** de Visual Studio Code (utiliza módulos nativos ES6). No requiere instalar dependencias obligatorias. Opcionalmente, también incluye soporte para desarrollo con **Vite**.

---

## 🚀 Cómo ejecutarlo

### Opción 1: Visual Studio Code + Live Server (Recomendado y sin instalación)

1. Abra la carpeta `finanzas-dashboard` en Visual Studio Code: **Archivo → Abrir carpeta**.
2. Abra el archivo `index.html`.
3. Haga clic derecho y seleccione **Open with Live Server** (o use el botón "Go Live" en la barra inferior).
4. La aplicación cargará automáticamente en su navegador en `http://127.0.0.1:5500/`.

### Opción 2: Con Node.js, Vite y Tailwind CSS v4 (Nativo)

Incluye compilación nativa de utilidades de **Tailwind CSS v4** mediante `@tailwindcss/vite`:
```bash
npm install
npm run dev
```
La aplicación abrirá automáticamente en `http://localhost:5173/` con Hot Module Replacement (HMR).

Para compilar para producción:
```bash
npm run build
```

---

## ⚡ Nuevas Capacidades de Escalabilidad (v2)

Esta versión evolucionó el proyecto de un script monolítico hacia una arquitectura modular en capas capaz de escalar a miles de movimientos:

1. **Paginación y Rendimiento Optimizado:**
   - Motor de consultas paginadas (10, 25, 50, 100 por página) que previene bloqueos de renderizado en el navegador con historiales extensos.
   - Búsqueda debounced (con retardo inteligente) que filtra en tiempo real sobre concepto, notas, categorías y cuentas.
   - Ordenamiento multidimensional (por fecha, importe o nombre).

2. **Cuentas y Billeteras Múltiples:**
   - Soporte para múltiples cuentas (Efectivo, Cuentas Bancarias / Ahorros, Tarjetas de Crédito, Billeteras Digitales).
   - Cálculo en tiempo real de saldos individuales y **Patrimonio Neto Consolidado**.
   - Módulo de **Transferencias Internas** entre cuentas sin distorsionar los ingresos o gastos globales.

3. **Gestión de Pagos Recurrentes y Suscripciones:**
   - Programe gastos fijos o suscripciones (Netflix, alquiler, gimnasio, servicios, nómina).
   - Cálculo del compromiso mensual proyectado.
   - Botón de registro con un solo clic para aplicar la suscripción al mes en curso sin duplicaciones.

4. **Soporte Multi-Moneda Configurable:**
   - Selector de divisas internacionales en Configuración: Peso Colombiano (`COP`), Dólar (`USD`), Euro (`EUR`), Peso Mexicano (`MXN`), Peso Argentino (`ARS`), Peso Chileno (`CLP`), Sol Peruano (`PEN`), Real Brasileño (`BRL`).
   - Formateo inteligente con `Intl.NumberFormat` adaptando automáticamente símbolos y decimales.

5. **Importación y Exportación Masiva (JSON y CSV):**
   - **Importar / Exportar Respaldo JSON:** Guarde copias de seguridad completas de toda su base de datos o restaure respaldos previos.
   - **Importar Extractos CSV:** Asistente inteligente que detecta delimitadores (`,` o `;`), mapea encabezados bancarios e importa movimientos automáticamente.
   - **Exportar CSV:** Descarga filtrada o total compatible con Microsoft Excel y Google Sheets (con codificación UTF-8 BOM).

6. **Migración Automática de Esquemas:**
   - Si utilizó la versión anterior, la aplicación detecta automáticamente la versión v1 (`finanza_dashboard_v1`) y migra sus datos al esquema v2 sin pérdida de información.

---

## 📁 Arquitectura del Código

El código está organizado siguiendo principios de responsabilidad única (SRP) y separación de capas:

```text
finanzas-dashboard/
├── index.html                   # Shell de la aplicación y modales accesibles
├── styles.css                   # Sistema de diseño, variables CSS y tema oscuro
├── README.md                    # Documentación del proyecto
├── package.json                 # Configuración opcional para scripts de Vite
├── app.js                       # Forwarder de compatibilidad
└── src/
    ├── main.js                  # Orquestador principal de la aplicación
    ├── core/
    │   ├── constants.js         # Configuración inicial, divisas y valores por defecto
    │   ├── eventBus.js          # Sistema desacoplado Pub/Sub de eventos
    │   ├── storage.js           # Adaptador de almacenamiento y pipeline de migraciones (v1 -> v2)
    │   └── store.js             # Almacén reactivo de estado central (Single Source of Truth)
    ├── services/
    │   ├── currencyService.js   # Formateo y gestión de divisas
    │   ├── transactionService.js# Motor de consultas, filtros, métricas y paginación
    │   ├── accountService.js    # Saldos, patrimonio neto y transferencias entre cuentas
    │   ├── budgetService.js     # Seguimiento de presupuestos y alertas de umbral
    │   ├── categoryService.js   # Ciclo de vida y validación de categorías
    │   ├── recurringService.js  # Motor de suscripciones y pagos programados
    │   └── dataTransferService.js # Exportador e importador con parsers de CSV y JSON
    └── ui/
        ├── toast.js             # Notificaciones toast animadas y accesibles
        ├── modal.js             # Controlador de modales con foco atrapado y tecla Escape
        ├── charts.js            # Gráficos de alta fidelidad en Canvas y gradientes CSS
        └── views/
            ├── dashboardView.js   # Vista de resumen financiero y KPIs
            ├── transactionsView.js# Vista de movimientos con tabla paginada
            ├── accountsView.js    # Vista y tarjetas de cuentas y saldos
            ├── budgetsView.js     # Vista de presupuestos y barras de progreso
            ├── categoriesView.js  # Vista de categorías de gastos e ingresos
            ├── recurringView.js   # Vista de suscripciones y gastos fijos
            └── settingsView.js    # Vista de configuración, divisas y respaldos
```

---

## 🔒 Privacidad y Almacenamiento

Todos los datos se almacenan exclusivamente de forma local en el navegador mediante `localStorage`. Ningún dato financiero viaja a servidores externos, garantizando total privacidad.
