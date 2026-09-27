import { Specialty } from "../../../../generated/prisma/client";
import { ApiError } from "../../errors/ApiError";
import { prisma } from "../../lib/prisma";
import { IPaginationOptions } from "../../interfaces/pagination";
import { PrismaQueryBuilder } from "../../../shared/PrismaQueryBuilder";

const createSpeciality = async (payload: Specialty): Promise<Specialty> => {
  const specialty = await prisma.specialty.create({
    data: payload,
  });
  return specialty;
};

const getAllSpecialties = async (filters: any, options: IPaginationOptions) => {
  const query = { ...filters, ...options };
  
  const queryBuilder = new PrismaQueryBuilder(query)
    .search(["title"])
    .filter();
    
  queryBuilder.addCondition({ isDeleted: false });

  const queryOptions = queryBuilder.build();

  const specialties = await prisma.specialty.findMany({
    ...queryOptions,
  });

  const total = await prisma.specialty.count({
    where: queryOptions.where,
  });

  return {
    meta: queryBuilder.getMeta(total),
    data: specialties,
  };
};

const updateSpecialty = async (id: string, payload: Partial<Specialty>): Promise<Specialty> => {
  const isSpecialtyExist = await prisma.specialty.findUnique({
    where: { id },
  });

  if (!isSpecialtyExist || isSpecialtyExist.isDeleted) {
    throw new ApiError(404, "Specialty not found!");
  }

  const specialty = await prisma.specialty.update({
    where: { id },
    data: payload,
  });
  return specialty;
};


const deleteSpecialty = async (id: string): Promise<Specialty> => {
  const isSpecialtyExist = await prisma.specialty.findUnique({
    where: { id },
  });

  if (!isSpecialtyExist) {
    throw new ApiError(404, "Specialty not found!");
  }

  const specialty = await prisma.specialty.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
  return specialty;
};

export const SpecialityService = {
  createSpeciality,
  getAllSpecialties,
  updateSpecialty,
  deleteSpecialty,
};
