
# 📄 Procesamiento de Archivos Grandes y Volcado a Base de Datos

## 🚀 Instalación y uso

Este servicio está preparado para ser ejecutado mediante Docker. Sigue estos pasos:

### 1. Levantar el servicio

```bash
docker compose up -d
```

### 2. Cargar archivos para procesamiento

Los archivos `.dat` deben colocarse en el volumen del contenedor en la carpeta `/uploads/process`. Podés subirlos así:

```bash
docker cp archivo.dat nombre_del_contenedor:/uploads/process
```

> 📁 Asegurate de que el archivo tenga el formato esperado (pipe-separated y validado con Joi).

---

## 📡 Endpoints disponibles

| Endpoint       | Descripción                                |
|----------------|--------------------------------------------|
| `/health`      | Devuelve el estado del servicio.           |
| `/metrics`     | Expone métricas para Prometheus.           |
| `/api-docs`    | Documentación Swagger (OpenAPI).           |

Las métricas incluyen:
- Uso de memoria (`nodejs_process_memory_rss_bytes`)
- Uso de CPU (`nodejs_process_cpu_percent`)
- Métricas estándar de Node.js

---

## 1. Lectura eficiente de archivos grandes

Para respetar los límites impuestos por el challenge y procesar archivos `.dat` de gran tamaño, se implementó la lectura mediante **streams**, lo cual permite:

- Leer el archivo línea por línea o en bloques.
- Procesar archivos de cualquier tamaño sin consumir toda la RAM.

> ⚠️ En ningún momento se vuelca el contenido completo del archivo (ni siquiera en chunks grandes) a memoria. Esto evita que el servicio se bloquee o que Kubernetes reinicie el pod por exceso de uso de recursos.

---

## 2. Inserción optimizada en base de datos

El proceso de escritura se realiza por lotes (`chunks`) y con múltiples capas de optimización:

- ✅ **Agrupamiento en chunks:** los registros se agrupan en bloques de tamaño configurable para evitar inserciones individuales.
- 🚀 **Bulk insert vía stored procedure:** la lógica de transacción se delega a SQL Server mediante un `stored procedure`, reduciendo la carga sobre el servicio.
- 🛠️ **Manejo de errores:** si un chunk falla, se registra el error sin detener el procesamiento del resto del archivo.

---

## 3. Razonamiento detrás de las optimizaciones

Cada técnica responde a un cuello de botella distinto:

| Técnica               | Problema que resuelve                                                        |
|-----------------------|-----------------------------------------------------------------------------|
| **Streams**           | Evitan el consumo excesivo de memoria.                                     |
| **Batching**          | Permite procesar registros de forma escalonada, sin acumulación infinita.  |
| **Bulk insert**       | Mejora la velocidad de escritura de grandes volúmenes.                     |
| **Manejo de errores** | Robustez ante datos corruptos (validación con Joi de líneas separadas por `|`). |
| **Pool de conexiones**| Permite escalar horizontalmente y soportar múltiples hilos o workers.       |
| **Watcher**           | Mueve los archivos por diferentes carpetas para evitar que se procesen múltiples veces. |
| **Prometheus**        | Se utiliza para exponer métricas del proceso y monitorear el rendimiento del servicio en tiempo real. |

---

## 4. Flujo de procesamiento

```text
Archivo .dat grande → /uploads/process
         ↓
Lectura del archivo por streams → /uploads/processing
         ↓
Buffer de registros (batch/chunks)
         ↓
Inserción en base de datos
→ Bulk insert + transacción (stored procedure)
         ↓
Validación (Joi) + Logs (Winston)
         ↓
Exposición de métricas (Prometheus)
```

---

## 5. Justificación de la arquitectura

Se combinan distintas técnicas por motivos de rendimiento, escalabilidad y robustez:

- Leer con streams pero insertar de a uno generaría cuellos de botella y puede volverse bloqueante si no se libera correctamente la memoria.
- Leer el archivo completo no es opción: agotaría la RAM y Kubernetes reiniciaría el pod.
- Usar `stored procedures` delega la lógica transaccional en SQL Server, lo que mejora la eficiencia y evita problemas de concurrencia o locks a nivel de aplicación.
- Las **métricas expuestas con Prometheus** permiten medir en tiempo real el estado del procesamiento, duración de cada batch, cantidad de errores, tamaño de archivos procesados, entre otros indicadores clave.

---

## 6. Posibles mejoras

Algunas ideas para futuras versiones del sistema:

- ☁️ **Almacenamiento en S3:** en lugar de mover archivos por carpetas locales, se podrían almacenar en un bucket S3. Los pods podrían observar el bucket y usar `.lock` o metadata para evitar colisiones.
- 🔄 **Sistemas de mensajería (Kafka, RabbitMQ):** los datos podrían ser enviados por eventos o colas para desacoplar el procesamiento.
- 📈 **Mejoras en infraestructura:** aumentar la RAM por pod permitiría trabajar con chunks más grandes. Actualmente, un archivo de 4 GB puede tardar cerca de 3 horas en procesarse. Con 20 GB, el rendimiento cae aún más.

---

## 🛠️ Tecnologías utilizadas

- **Node.js**
- **TypeScript**
- **SQL Server**
- **Joi** (validación de datos)
- **Winston** (logger)
- **Streams**
- **Stored Procedures**
- **Docker / Kubernetes-ready**
- **Prometheus** (exposición de métricas para monitoreo)
- **Swagger / OpenAPI**

## Configuración de Kubernetes 

Para ejecutar el servicio en Kubernetes, usa el archivo kubernetes-deployment.yml con el siguiente comando:

```bash
kubectl apply -f kubernetes-deployment.yml
```

Este archivo incluye el Deployment, PersistentVolumeClaim, Service y el HorizontalPodAutoscaler necesarios para el correcto funcionamiento del servicio en el clúster de Kubernetes.