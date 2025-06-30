#!/bin/bash

set -e  

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' 

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

CONTAINER_NAME="sqlserver"
SA_PASSWORD="yourStrong(!)Password"
DB_NAME="ClientesDB"
MAX_ATTEMPTS=60
WAIT_SECONDS=2

log "=== Iniciando configuración de Base de Datos ==="

if ! docker ps -a --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_error "El contenedor ${CONTAINER_NAME} no existe. Ejecute docker-compose up primero."
    exit 1
fi

if ! docker ps --format 'table {{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log_error "El contenedor ${CONTAINER_NAME} no está corriendo."
    exit 1
fi

check_sqlserver_connection() {
    docker exec "${CONTAINER_NAME}" /opt/mssql-tools/bin/sqlcmd \
        -S localhost -U sa -P "${SA_PASSWORD}" \
        -Q "SELECT 1" -b > /dev/null 2>&1
}

log "Esperando conexión a SQL Server..."
attempt=1
while [ $attempt -le $MAX_ATTEMPTS ]; do
    if check_sqlserver_connection; then
        log "✅ SQL Server está listo (intento $attempt/$MAX_ATTEMPTS)"
        break
    fi
    
    if [ $attempt -eq $MAX_ATTEMPTS ]; then
        log_error "❌ SQL Server no responde después de $MAX_ATTEMPTS intentos"
        exit 1
    fi
    
    log "⏳ Intento $attempt/$MAX_ATTEMPTS - SQL Server no está listo aún..."
    sleep $WAIT_SECONDS
    ((attempt++))
done

execute_sql() {
    local sql_command="$1"
    local description="$2"
    
    log "Ejecutando: $description"
    if docker exec "${CONTAINER_NAME}" /opt/mssql-tools/bin/sqlcmd \
        -S localhost -U sa -P "${SA_PASSWORD}" \
        -Q "$sql_command" -b; then
        log "✅ $description completado"
    else
        log_error "❌ Error en: $description"
        return 1
    fi
}

log "Verificando/creando base de datos ${DB_NAME}..."
execute_sql "
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'${DB_NAME}')
BEGIN
    CREATE DATABASE ${DB_NAME};
    PRINT 'Base de datos ${DB_NAME} creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Base de datos ${DB_NAME} ya existe';
END" "Creación de base de datos"

if [ ! -f "SCRIPT.sql" ]; then
    log_error "❌ El archivo SCRIPT.sql no existe en el directorio actual"
    exit 1
fi

log "Copiando script de inicialización..."
if docker cp SCRIPT.sql "${CONTAINER_NAME}:/tmp/SCRIPT.sql"; then
    log "✅ Script copiado exitosamente"
else
    log_error "❌ Error al copiar el script"
    exit 1
fi

log "Ejecutando script de inicialización..."
if docker exec "${CONTAINER_NAME}" /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P "${SA_PASSWORD}" \
    -d "${DB_NAME}" -i /tmp/SCRIPT.sql; then
    log "✅ Script de inicialización ejecutado exitosamente"
else
    log_error "❌ Error al ejecutar el script de inicialización"
    exit 1
fi

log "Verificando tablas creadas..."
docker exec "${CONTAINER_NAME}" /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P "${SA_PASSWORD}" \
    -d "${DB_NAME}" -Q "
SELECT 
    t.name AS TableName,
    s.name AS SchemaName,
    (SELECT COUNT(*) FROM sys.columns WHERE object_id = t.object_id) AS ColumnCount
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.name = 'Clientes'"

log "Verificando procedimientos almacenados..."
docker exec "${CONTAINER_NAME}" /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P "${SA_PASSWORD}" \
    -d "${DB_NAME}" -Q "
SELECT 
    name AS ProcedureName,
    create_date AS CreateDate
FROM sys.procedures 
WHERE name IN ('sp_EstadisticasClientes', 'sp_bulkInsertClientes')"

log "Verificando tipos de datos personalizados..."
docker exec "${CONTAINER_NAME}" /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P "${SA_PASSWORD}" \
    -d "${DB_NAME}" -Q "
SELECT 
    name AS TypeName,
    is_table_type AS IsTableType
FROM sys.types 
WHERE is_user_defined = 1"

log "🎉 ¡Inicialización completada exitosamente!"
log "Base de datos disponible en: localhost:1433"
log "Usuario: sa"
log "Base de datos: ${DB_NAME}"

docker exec "${CONTAINER_NAME}" rm -f /tmp/SCRIPT.sql 2>/dev/null || true

log "=== Configuración finalizada ==="