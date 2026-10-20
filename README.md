# FinScope v3 — Dashboard de Finanzas Personales

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](package.json)
[![Architecture](https://img.shields.io/badge/architecture-Clean%20Architecture%20%7C%20Local--First-emerald.svg)](src/)
[![Database](https://img.shields.io/badge/storage-IndexedDB%20%2B%20Firestore-orange.svg)](src/core/storage.js)
[![Math](https://img.shields.io/badge/precision-Safe%20Math%20(Cents)-purple.svg)](src/services/currencyService.js)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**FinScope v3** es una plataforma web progresiva de finanzas personales de alto rendimiento construida bajo los principios de **Clean Architecture**, enfoque **Local-First / Offline-First** sobre **IndexedDB nativo**, aritmética monetaria exacta (**Safe Math en centavos**), un **Sistema Contable de Alcancías (Pockets)** con invariante matemática estricta y **Sincronización Granular en la Nube con Cloud Firestore** mediante resolución de conflictos **Last-Write-Wins (LWW)** y **Soft Deletes**.

---

## 🏗️ Diagrama de Flujo y Arquitectura del Sistema

```mermaid
flowchart TD
    subgraph ClientInit ["1. Ciclo de Inicialización & Hidratación"]
        A[index.html / main.js] --> B[Store.init()]
        B --> C{¿Existe finscope_db_v3?}
        C -- No --> D[StorageService.runMigrationPipeline()]
        D -->|Detecta v1 o v2 en localStorage| E[Migración: v1 -> v2 -> v3]
        E -->|Guarda esquema v3 en IndexedDB| F[(IndexedDB: finscope_db_v3)]
        C -- Sí --> G[Carga Stores IndexedDB]
        G --> H[Store Reactivo Central v3]
        F --> H
        H -->|store:hydrated| I[Render Inicial de UI y Vistas]
    end

    subgraph AccountingEngine ["2. Motor Contable & Alcancías (Safe Math)"]
        J[Usuario / Acción Contable] --> K{Tipo de Movimiento}
        K -->|pocket_deposit| L["Mover Saldo Disponible -> Alcancía (+A, -D, Total = Constante)"]
        K -->|pocket_withdraw| M["Mover Alcancía -> Saldo Disponible (-A, +D, Total = Constante)"]
        K -->|Gasto desde Alcancía| N["Deducir de Alcancía & Total (-A, -T, D = Constante)"]
        K -->|Eliminación de Alcancía| O["Auto-reintegro: pocket_withdraw automático de fondos remanentes"]
        L & M & N & O --> P[Validación Invariante: Total = Disponible + Σ Alcancías]
        P -->|Actualiza Estado Inmutable| H
    end

    subgraph SyncEngine ["3. Sincronización Nube (Offline-First)"]
        Q[Google Identity Services] -->|Auth JWT| R[authService.js]
        R -->|attachUser| S[firestoreService.js]
        H -.->|EventBus: state:changed| S
        S -->|Cola LWW updatedAt| T[Firestore: /users/UID/collection/docId]
        T -.->|onSnapshot tiempo real| U{Comparar updatedAt (LWW)}
        U -->|Remoto > Local| V[Actualizar Store & IndexedDB]
        U -->|Local > Remoto| W[Subir a Firestore]
    end
```

---

## ✨ Novedades y Capacidades Centrales (v3.0.0)

### 1. Enfoque Local-First con IndexedDB (`finscope_db_v3`)
- **Almacenamiento No Volátil:** Supera el límite de 5 MB de `localStorage` utilizando una base de datos IndexedDB transaccional con 6 Object Stores dedicados: `meta`, `accounts`, `categories`, `transactions`, `budgets` y `recurring`.
- **Pipeline de Migración Automática (`v1 -> v2 -> v3`):** Inspecciona el almacenamiento local al inicio; si detecta esquemas previos (v1 monolítico o v2 decimal), migra sin pérdida de información, convierte los balances a centavos enteros e inyecta la estructura de alcancías y metadatos LWW.
- **Tolerancia a Fallos:** Capacidad de operar al 100% sin conexión a internet ni dependencias externas.

### 2. Aritmética Monetaria Exacta (Safe Math en Centavos)
- **Eliminación del Error de Coma Flotante IEEE 754:** Las operaciones financieras (`0.1 + 0.2 = 0.30000000000000004`) están completamente desterradas. Todos los montos se almacenan y procesan como números enteros en centavos (base 100):
  $$\text{Centavos} = \text{round}(\text{Monto Decimal} \times 100)$$
- **Servicio Centralizado:** [`currencyService.js`](src/services/currencyService.js) gestiona las conversiones bidireccionales (`toCents` / `fromCents`) y el formateo localizado mediante la API nativa `Intl.NumberFormat`.

### 3. Sistema de Alcancías / Pockets con Invariante Contable
- **Cuentas Padre y Sub-Entidades:** Cada cuenta (Bancaria, Efectivo, Billetera) puede contener múltiples alcancías con metas de ahorro, iconos y colores personalizados.
- **Invariante Matemática:**
  $$\text{Saldo Total} = \text{Saldo Disponible} + \sum_{i=1}^{n} \text{Saldo Alcancía}_i$$
- **Operaciones de Alcancía:**
  - `pocket_deposit`: Traslada liquidez del saldo disponible a la alcancía sin alterar el saldo total ni el P&L global.
  - `pocket_withdraw`: Retorna fondos de la alcancía al saldo disponible.
  - **Gasto directo desde Alcancía:** Descuenta directamente de la meta asignada y del saldo total, preservando el disponible general.
  - **Eliminación con Auto-Reintegro:** Al eliminar una alcancía que aún conserva fondos (`balance > 0`), el sistema genera una transacción interna de liquidación que devuelve de inmediato el dinero al saldo disponible de la cuenta padre.

### 4. Sincronización Nube Granular (Firestore v3)
- **Estructura por Subcolecciones:** Los datos se estructuran bajo `/users/{userId}/{collection}/{docId}`, garantizando aislamiento estricto entre cuentas y consultas eficientes.
- **Resolución de Conflictos Last-Write-Wins (LWW):** Cada entidad cuenta con marcas de tiempo `updatedAt` y estados `syncStatus`. Si un registro se edita offline en múltiples dispositivos, prevalece la versión con mayor marca de tiempo.
- **Soft Deletes (`deletedAt`):** Las eliminaciones marcan el documento con `deletedAt: timestamp` en lugar de borrarlo físicamente al instante, asegurando que la orden de eliminación se replique a todos los dispositivos sincronizados antes de su purga.

---

## 📐 Invariantes Contables y Reglas de Negocio

| Invariante / Regla | Implementación | Validación |
| :--- | :--- | :--- |
| **Invariante de Cuentas** | `totalBalance = availableBalance + Σ(pocketBalances)` | Verificada en cada cálculo de balance en `accountService.js` y protegida en suite de pruebas. |
| **Safe Math Base 100** | `$19.99` $\rightarrow$ `1999` centavos | Enteros puros en IndexedDB y Firestore; `currencyService.fromCents` solo en capa de presentación. |
| **Aislamiento de KPIs** | Gráficos y KPIs excluyen `transfer`, `pocket_deposit` y `pocket_withdraw` | Filtro estricto `(t.type === 'income' \|\| t.type === 'expense')` en `transactionService.getMonthStats` y Canvas. |
| **Filtro de Soft Deletes** | Todo registro con `deletedAt !== null` es invisible | Ignorado automáticamente en `getAll()`, `getById()`, `query()`, tarjetas de saldo y reportes. |
| **Reintegro de Alcancía** | Alcancía eliminada con `balance > 0` regresa al disponible | Generación automática de `pocket_withdraw` con concepto *"Liquidación de alcancía"*. |

---

## 📁 Estructura del Proyecto

```text
FinScope/
├── index.html                   # Shell accesible, estructura semántica y modales
├── styles.css                   # Sistema de diseño, variables CSS, glassmorphism y tema oscuro
├── firestore.rules              # Reglas de seguridad granular v3 para Firebase Cloud Firestore
├── vercel.json                  # Cabeceras de seguridad HTTP, caché estático y SPA rewrites
├── vite.config.js               # Configuración de empaquetado Vite + Tailwind CSS v4
├── package.json                 # Dependencias y scripts de construcción y pruebas
├── .env.example                 # Plantilla de variables de entorno (GIS y Firebase)
├── scripts/
│   └── verify-v3.js             # Suite de verificación pre-release y smoke tests contables
└── src/
    ├── main.js                  # Orquestador, ciclo de vida, listeners globales y ruteo SPA
    ├── core/
    │   ├── constants.js         # Constantes de dominio, versión v3, divisas y valores base
    │   ├── eventBus.js          # Bus de eventos desacoplado Pub/Sub
    │   ├── storage.js           # Adaptador IndexedDB (finscope_db_v3) y pipeline de migración
    │   └── store.js             # Single Source of Truth reactivo con persistencia asíncrona
    ├── services/
    │   ├── accountService.js    # Lógica de cuentas, alcancías e invariantes contables
    │   ├── authService.js       # Autenticación con Google Identity Services (GIS)
    │   ├── budgetService.js     # Seguimiento de presupuestos con cálculo en centavos
    │   ├── categoryService.js   # Gestión de categorías con metadatos LWW y soft delete
    │   ├── currencyService.js   # Motor Safe Math, normalización a centavos y formateo
    │   ├── dataTransferService.js # Exportador e importador JSON v3 y CSV bancario
    │   ├── firestoreService.js  # Sincronización en tiempo real por subcolecciones con LWW
    │   ├── recurringService.js  # Motor de suscripciones y compromisos fijos
    │   └── transactionService.js# Motor de transacciones, paginación, filtros y KPIs
    └── ui/
        ├── charts.js            # Gráficos Canvas de alta fidelidad (Cashflow diario y Dona de gastos)
        ├── icons.js             # Mapeo y renderizado de Material Symbols Rounded
        ├── modal.js             # Controlador de modales con foco atrapado y accesibilidad
        ├── toast.js             # Sistema de notificaciones toast flotantes
        └── views/
            ├── accountsView.js    # Vista de cuentas, gestión de alcancías y transferencias
            ├── budgetsView.js     # Vista de presupuestos y barras de progreso
            ├── categoriesView.js  # Vista de categorías de gastos e ingresos
            ├── dashboardView.js   # Vista principal con KPIs, gráficos y movimientos recientes
            ├── recurringView.js   # Vista de suscripciones y compromisos mensuales
            ├── settingsView.js    # Configuración de divisas, importación/exportación y nube
            └── transactionsView.js# Tabla de movimientos con búsqueda y paginación
```

---

## 🛠️ Stack Tecnológico

- **Core:** HTML5 Semántico + Vanilla JavaScript (ES6 Modules nativos). Cero dependencias pesadas de frameworks front-end (React/Vue/Angular innecesarios).
- **Estilos:** Vanilla CSS con variables de diseño, glassmorphism, modo oscuro integrado y `@tailwindcss/vite` (Tailwind CSS v4).
- **Almacenamiento Local:** Web API **IndexedDB** (`finscope_db_v3`) con transacciones ACID locales.
- **Sincronización en la Nube:** Firebase Cloud Firestore 13.x.
- **Autenticación:** Google Identity Services (GIS / OAuth 2.0).
- **Gráficos:** HTML5 Canvas API nativo con renderizado de alta densidad (Retina / DPR scaling).
- **Herramientas de Build:** Vite 6.x.

---

## 🚀 Guía de Despliegue a Producción

### 1. Variables de Entorno
Copia el archivo `.env.example` como `.env` y configura tus credenciales:

```bash
cp .env.example .env
```

Configura las variables correspondientes en tu proveedor (ej. Vercel / Firebase Hosting):
```ini
VITE_GOOGLE_CLIENT_ID=tu_cliente.apps.googleusercontent.com
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
VITE_FIREBASE_MEASUREMENT_ID=tu_measurement_id
```

### 2. Despliegue de Reglas de Seguridad en Firebase
Aplica las reglas de seguridad de Firestore incluidas en [`firestore.rules`](firestore.rules):

```bash
# Iniciar sesión en Firebase CLI
firebase login

# Desplegar únicamente las reglas de Firestore
firebase deploy --only firestore:rules
```

### 3. Ejecución de la Suite Pre-Release (Smoke Tests)
Verifica la integridad de las conversiones de moneda y las invariantes contables de alcancías:

```bash
npm run test:verify
```

### 4. Compilación y Despliegue en Vercel
El repositorio incluye [`vercel.json`](vercel.json) preconfigurado con cabeceras de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) y políticas de caché:

```bash
# Instalación y build local de prueba
npm install
npm run build

# Despliegue directo con Vercel CLI
vercel --prod
```

O conecta el repositorio directamente en el panel de **Vercel**:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.
