import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

const validateRequest = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedData = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
        cookies: req.cookies,
      });

      req.body = (parsedData as any).body || req.body;

      return next();
    } catch (error) {
      next(error);
    }
  };
};

export default validateRequest;
