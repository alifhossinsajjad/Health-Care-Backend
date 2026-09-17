import { Prisma } from "../../../generated/prisma/client";
import { TErrorSources, TGenericErrorResponse } from "../interfaces/error";

const handlePrismaError = (
  err: Prisma.PrismaClientKnownRequestError
): TGenericErrorResponse => {
  let errorSources: TErrorSources = [
    {
      path: "",
      message: err.message,
    },
  ];
  let statusCode = 400;
  let message = "Database Error";

  if (err.code === "P2025") {
    message = "Record Not Found";
    errorSources = [
      {
        path: "",
        message: "The requested record was not found in the database.",
      },
    ];
    statusCode = 404;
  } else if (err.code === "P2002") {
    // Unique constraint violation
    message = "Duplicate Entry";
    const target = (err.meta?.target as string[]) || [];
    errorSources = [
      {
        path: target.join(", "),
        message: `The ${target.join(", ")} already exists.`,
      },
    ];
    statusCode = 409;
  } else if (err.code === "P2028") {
    message = "Transaction Failed";
    errorSources = [
      {
        path: "",
        message: "Unable to start or complete the database transaction.",
      },
    ];
    statusCode = 500;
  }

  return {
    statusCode,
    message,
    errorSources,
  };
};

export default handlePrismaError;
