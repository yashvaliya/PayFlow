import { Router } from 'express';
import { ProductController } from '../controllers/productController.js';

export const productRouter = Router();

productRouter.get('/', ProductController.getProducts);
