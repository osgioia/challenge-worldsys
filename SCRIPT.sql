-- Script para crear la tabla Clientes con el nuevo esquema
CREATE TABLE Clientes (
    id VARCHAR(50) NOT NULL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    apellido VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    edad INT NOT NULL CHECK (edad > 0 AND edad <= 120),
    fechaCreacion DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- Constraint para validar formato de email básico
ALTER TABLE Clientes
ADD CONSTRAINT CK_Clientes_Email
CHECK (email LIKE '%@%.%' AND LEN(email) > 5);
GO

-- Constraint para validar que nombre y apellido no estén vacíos
ALTER TABLE Clientes
ADD CONSTRAINT CK_Clientes_Nombre
CHECK (LEN(LTRIM(RTRIM(nombre))) > 0);
GO

ALTER TABLE Clientes
ADD CONSTRAINT CK_Clientes_Apellido
CHECK (LEN(LTRIM(RTRIM(apellido))) > 0);
GO

-- Índices para mejorar performance
CREATE INDEX IX_Clientes_Email ON Clientes (email);
CREATE INDEX IX_Clientes_FechaCreacion ON Clientes (fechaCreacion);
CREATE INDEX IX_Clientes_Apellido_Nombre ON Clientes (apellido, nombre);
GO

-- Índice único para evitar emails duplicados
CREATE UNIQUE INDEX IX_Clientes_Email_Unique ON Clientes (email);
GO

-- Procedimiento almacenado para obtener estadísticas de carga
CREATE PROCEDURE sp_EstadisticasClientes
AS
BEGIN
    -- Estadísticas generales
    SELECT
        COUNT(*) as TotalClientes,
        COUNT(DISTINCT email) as EmailsUnicos,
        MIN(fechaCreacion) as PrimerRegistro,
        MAX(fechaCreacion) as UltimoRegistro,
        AVG(CAST(edad as FLOAT)) as EdadPromedio,
        MIN(edad) as EdadMinima,
        MAX(edad) as EdadMaxima
    FROM Clientes;

    -- Top 10 dominios de email más usados
    SELECT TOP 10
        SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email)) as Dominio,
        COUNT(*) as Cantidad
    FROM Clientes
    GROUP BY SUBSTRING(email, CHARINDEX('@', email) + 1, LEN(email))
    ORDER BY COUNT(*) DESC;
END;
GO

CREATE TYPE ClienteTipo AS TABLE (
  id VARCHAR(50),
  nombre VARCHAR(255),
  apellido VARCHAR(255),
  email VARCHAR(255),
  edad INT
);


CREATE PROCEDURE sp_bulkInsertClientes
  @Clientes ClienteTipo READONLY
AS
BEGIN
  SET NOCOUNT ON;

  MERGE INTO Clientes AS target
  USING @Clientes AS source
  ON target.id = source.id
  WHEN MATCHED THEN
    UPDATE SET 
      nombre = source.nombre,
      apellido = source.apellido,
      email = source.email,
      edad = source.edad
  WHEN NOT MATCHED THEN
    INSERT (id, nombre, apellido, email, edad)
    VALUES (source.id, source.nombre, source.apellido, source.email, source.edad);
END;