"use client";
import { useState } from "react";
import type { HouseBuilding } from "@/lib/simulation/types";
import HousePreview from "./house-preview";

export default function PropertyPreview({ house }: { house: HouseBuilding }) {
  const [open, setOpen] = useState(false);
  return <><button className="account-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide preview" : "Preview house"}</button>
    {open && <HousePreview house={house} />}</>;
}
