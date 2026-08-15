export const PORT: number = Number(process.env.PORT) || 9000;
export const DATABASE_URL: string = process.env.DATABASE_URL || "postgresql://postgres:dev@localhost:5432/cloudcanvas";