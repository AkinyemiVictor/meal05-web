import { NextResponse } from "next/server";

export const respondZodError = (error) => {
  const issues = error?.issues?.map((i) => ({ path: i.path, message: i.message })) || [
    { message: "Invalid request" },
  ];
  return NextResponse.json({ error: "Validation failed", issues }, { status: 400 });
};

const validateApi = { respondZodError };

export default validateApi;
