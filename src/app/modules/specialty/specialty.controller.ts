import { Request, Response } from "express";
import { SpecialityService } from "./specialty.service";


const createSpecialty = async (req: Request, res: Response)=> {
const payload = req.body;
  try {
    const specialty = await SpecialityService.createSpeciality(payload);
    res.status(201).json(specialty);
  } catch (error) {
    res.status(500).json({ error: "Failed to create specialty" });
  }
}


export const SpecialtyController = {
  createSpecialty,
};