import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  communesForRegion,
  isChileAddressComplete,
  sanitizeChileAddress,
} from "@/lib/crm/chile-address";

const addressSchema = z.object({
  street: z.string().trim().min(1).max(160),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(80).optional().default(""),
  commune: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
});

const patchSchema = z.object({
  commercialAddress: addressSchema.nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await db.getCompanySettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (
    parsed.data.commercialAddress === undefined &&
    parsed.data.phone === undefined
  ) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  const commercialAddress =
    parsed.data.commercialAddress === undefined
      ? undefined
      : parsed.data.commercialAddress
        ? sanitizeChileAddress(parsed.data.commercialAddress)
        : null;

  if (commercialAddress) {
    const communes = communesForRegion(commercialAddress.region);
    if (!communes.length || !isChileAddressComplete(commercialAddress)) {
      return NextResponse.json(
        { error: "Completa región, comuna, calle y número" },
        { status: 400 },
      );
    }
  }

  const settings = await db.updateCompanySettings({
    commercialAddress,
    phone: parsed.data.phone,
  });
  return NextResponse.json({ settings });
}
