"use client";

import InspectionForm, { InspectionSection } from "../_components/InspectionForm";

const intro = `The Daily Pre-Trip Inspection is a mandatory safety and readiness inspection that must be completed by the assigned employee before operating or transporting any company vehicle, trailer, or equipment. This inspection is required prior to leaving the shop or yard and must be submitted in AirTable by scanning the vehicle’s assigned QR code or by using the "Vehicle Lookup" Interface on AirTable.

Employees are responsible for thoroughly inspecting all applicable components of the vehicle and any attached or associated equipment, including trucks, trailers, plows, salters, and skid/loader machinery. All inspection items must be accurately completed based on the actual condition of the equipment at the time of inspection.

If any defect, damage, malfunction, or unsafe condition is identified:
• The issue must be clearly documented in the inspection form
• The vehicle or equipment must be red tagged if unsafe
• The mechanic must be notified immediately via WhatsApp “OI Maintenance Chat” and a "Maintenance Request Form" should be completed via AirTable
• The vehicle or equipment must not be operated or taken off-site until cleared`;

const acknowledgement = `By entering my name and submitting this form, I certify that I have personally completed this pre-trip inspection and that all information provided is true, accurate, and complete to the best of my knowledge. I acknowledge that this inspection was performed prior to operating the vehicle or equipment and before leaving the shop or yard. I understand that any defects, damage, or unsafe conditions identified must be reported immediately, and that vehicles or equipment deemed unsafe must not be operated until properly repaired and approved. I further understand that this electronic submission constitutes my legal signature and has the same force and effect as a handwritten signature, and that failure to complete this inspection or to report known issues may result in disciplinary action.`;

const sections: InspectionSection[] = [
  {
    id: "truck",
    title: "Truck Inspection",
    applicableLabel: "Truck Inspection Applicable",
    vehicleTypes: ["truck", "car"], // ✅ car only sees this section

    items: [
      { key: "oil_level", label: "Oil level acceptable" },
      { key: "washer_fluid", label: "Washer fluid level acceptable" },
      { key: "coolant_level", label: "Coolant level acceptable" },
      { key: "belts", label: "Belts in proper working order" },
      { key: "battery_terminals", label: "Battery terminals secure" },
      { key: "front_tires", label: "Front tires PSI & condition acceptable" },
      { key: "front_lights", label: "Front headlights & turn signals operational" },
      { key: "door_hinges", label: "Door hinges & latches function properly" },
      { key: "wipers", label: "Wiper blades operational" },
      { key: "windows", label: "Windows operational" },
      { key: "body_damage", label: "No new body damage" },
      { key: "fuel_cap", label: "Fuel cap properly attached" },
      { key: "rear_tires", label: "Rear tires PSI & condition acceptable" },
      { key: "rear_lights", label: "Rear taillights & turn signals operational" },
      { key: "jumper_cables", label: "Jumper cables present" },
      { key: "first_aid", label: "First aid kit present" },
      { key: "fire_extinguisher", label: "Fire extinguisher present" },
      { key: "tow_strap", label: "Tow strap present" },
      { key: "strobe_lights", label: "Strobe/flood lights operational" },
      { key: "equipment_secured", label: "Equipment secured & operational" },
      { key: "equipment_fuel_oil", label: "Equipment fuel & oil filled, extra fuel cans present" },
    ],
  },
  {
    id: "skid_loader",
    title: "Skid / Loader Inspection",
    applicableLabel: "Skid/Loader Inspection Applicable",
    vehicleTypes: ["skidsteer", "loader"],

    items: [
      { key: "no_damage", label: "No visible damage" },
      { key: "no_leaks", label: "No oil, hydraulic, or fuel leaks" },
      { key: "tires_tracks", label: "Tires or tracks in good condition" },
      { key: "wheel_lugs", label: "Wheel lugs secure (if applicable)" },
      { key: "track_tension", label: "Track tension acceptable (if applicable)" },
      { key: "frame_joint", label: "Frame & articulation joint condition acceptable" },
      { key: "pins_bushings", label: "Pins & bushings secure" },
      { key: "mounting_plate", label: "Attachment mounting plate secure" },
      { key: "safety_decals", label: "Safety decals present" },
      { key: "fire_extinguisher", label: "Fire extinguisher present (if equipped)" },
      { key: "engine_oil", label: "Engine oil level acceptable" },
      { key: "hydraulic_fluid", label: "Hydraulic fluid level acceptable" },
      { key: "coolant_full", label: "Coolant level full" },
      { key: "fuel_level", label: "Fuel level" },
      { key: "def_level", label: "DEF level acceptable (if applicable)" },
      { key: "seat_belt", label: "Seat belt condition acceptable" },
      { key: "operator_restraint", label: "Operator restraint functioning (if equipped)" },
      { key: "gauges", label: "Gauges operational" },
      { key: "check_engine", label: "Check engine light on" },
      { key: "warning_lights", label: "Warning lights illuminated" },
      { key: "diag_codes", label: "Diagnostic codes displayed" },
      { key: "diag_codes_list", label: "Diagnostic codes list" },
      { key: "horn", label: "Horn operational" },
      { key: "backup_alarm", label: "Backup alarm operational" },
      { key: "hoses", label: "Hydraulic hoses undamaged" },
      { key: "couplers", label: "Couplers clean & secure" },
      { key: "aux_hydraulics", label: "Auxiliary hydraulics functioning (if applicable)" },
      { key: "lift_arms", label: "Lift arms operate smoothly" },
      { key: "bucket_condition", label: "Bucket/attachment condition acceptable" },
      { key: "pins_retainers", label: "Pins & retainers secure" },
      { key: "starts_normally", label: "Engine starts normally" },
      { key: "no_abnormal_noises", label: "No abnormal noises" },
      { key: "no_excess_smoke", label: "No excessive smoke" },
      { key: "controls", label: "Controls respond correctly" },
      { key: "steering", label: "Steering responds correctly (if applicable)" },
      { key: "brakes", label: "Brakes operational (if applicable)" },
    ],
  },
  {
    id: "trailer",
    title: "Trailer Inspection",
    applicableLabel: "Trailer Inspection Applicable",
    nameFieldLabel: "Trailer Name", 
    vehicleTypes: ["truck"], // 🚫 car does NOT see trailers

    items: [
      { key: "chains_hooks", label: "Chains & hooks in good condition" },
      { key: "plug_7way", label: "7-way plug undamaged" },
      { key: "coupler_latch", label: "Coupler latch operates correctly" },
      { key: "coupler_pin", label: "Coupler pin in place" },
      { key: "trailer_tires", label: "Trailer tires PSI & condition acceptable" },
      { key: "trailer_lights", label: "Trailer lights & blinkers operational" },
      { key: "door_gate", label: "Door/gate shuts & latches properly" },
      { key: "equipment_loaded", label: "Equipment secured & loaded" },
      { key: "equipment_checked", label: "Equipment oil/fuel/tires checked" },
    ],
  },
  {
    id: "plow",
    title: "Plow Inspection",
    applicableLabel: "Plow Inspection Applicable",
    nameFieldLabel: "Plow Name",
    vehicleTypes: ["truck"],

    items: [
      { key: "plow_mounted", label: "Plow securely mounted" },
      { key: "plow_electrical", label: "Electrical connections secure" },
      { key: "plow_hoses", label: "Hydraulic hoses in good condition" },
      { key: "plow_controller", label: "Plow controller present" },
      { key: "plow_functions", label: "Plow functions operate properly" },
      { key: "plow_cutting_edge", label: "Cutting edge serviceable" },
      { key: "plow_lights", label: "Plow lights operational & aimed" },
    ],
  },
  {
    id: "salter",
    title: "Salter Inspection",
    applicableLabel: "Salter Inspection Applicable",
    vehicleTypes: ["truck"],

    items: [
      { key: "salter_electrical", label: "Salter electrical connections secure" },
      { key: "salter_auger", label: "Conveyor/auger operates" },
      { key: "salter_spinner", label: "Spinner operates" },
      { key: "salter_controller", label: "Salter controller present" },
    ],
  },
  
];

export default function PreTripInspectionPage() {
  return (
    <InspectionForm
      type="pre-trip"
      title="New Daily Pre-Trip Inspection Form"
      intro={intro}
      sections={sections}
      acknowledgementText={acknowledgement}
    />
  );
}
