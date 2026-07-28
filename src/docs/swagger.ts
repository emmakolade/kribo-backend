import swaggerJSDoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Kribo Backend API',
      version: '1.0.0',
      description: 'Backend for Kribo booking platform',
    },
  },
  apis: ['src/routes/*.ts'],
});
