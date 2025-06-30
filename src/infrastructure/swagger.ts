import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cliente Processor API',
      version: '1.0.0',
      description: 'API para procesamiento de archivos de clientes'
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Servidor de desarrollo'
      }
    ]
  },
  apis: ['./src/interfaces/routes/*.ts', './src/interfaces/*.ts']
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;