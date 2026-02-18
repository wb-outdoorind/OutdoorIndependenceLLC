"use client";

import InspectionForm, { InspectionItem, InspectionSection } from "../_components/InspectionForm";

export default function PostTripPage() {
  const intro = `The Daily Post-Trip Inspection is a mandatory condition and accountability inspection that must be completed by the assigned employee immediately upon returning to the shop or yard with any company truck, trailer, or equipment. This inspection must be submitted in AirTable before leaving the vehicle unattended or ending the work shift and is accessed by scanning the vehicle’s assigned QR code.

Teammates are required to accurately document the condition of all applicable vehicles and equipment, including any damage, defects, operational issues, or abnormal conditions identified during use. Ending mileage or operating hours must be recorded to support maintenance scheduling and compliance tracking.

If any unsafe condition, damage, or mechanical issue is identified:
• The issue must be clearly documented in the inspection
• The vehicle or equipment must be red tagged
• The unit must be secured in the designated area
• Maintenance must be notified immediately via WhatsApp “OI Maintenance Chat” and a "Maintenance Request Form" should be filled out via AirTable
• The vehicle or equipment must not be placed back into service until approved`;

  const acknowledgement = `By entering my name and submitting this form, I certify that I have personally completed this post-trip inspection and that the information provided is true, accurate, and complete to the best of my knowledge. I acknowledge that this inspection was completed immediately upon return and prior to leaving the vehicle unattended or ending my shift. I understand that any damage, defects, or unsafe conditions must be reported and that unsafe equipment must be red tagged and removed from service. I further acknowledge that this electronic submission constitutes my legal signature and has the same force and effect as a handwritten signature.`;

  const sections: InspectionSection[] = [
    {
      id: "truck",
      title: "Truck Inspection",
      applicableLabel: "Truck Inspection Applicable",
      vehicleTypes: ["truck", "car"], // ✅ car only sees this section
      items: [
        { key: "oil_level", label: "Oil level acceptable" },
        { key: "washer_fluid", label: "Washer fluid acceptable" },
        { key: "coolant_full", label: "Coolant level full" },
        { key: "tires_ok", label: "Tires operational and correct PSI" },
        { key: "lights_ok", label: "All lights operational" },
        { key: "no_body_damage", label: "No new body damage" },
        { key: "hitch_ball_pin", label: "Hitch, ball (2-5/16”), and pin secured" },
        { key: "safety_equipment", label: "Required safety equipment present" },
        { key: "trash_removed", label: "Trash/debris removed from cab and bed" },
        { key: "windows_closed", label: "Windows closed" },
        { key: "equipment_secured_next_day", label: "Equipment loaded and secured for next day" },
        { key: "equipment_fuel_oil", label: "Equipment fuel filled and oil checked" },
        { key: "equipment_clean_operational", label: "Equipment clean and operational" },
      ],
    },
    {
      id: "skid_loader",
      title: "Skid / Loader Inspection",
      applicableLabel: "Skid/Loader Inspection Applicable",
      vehicleTypes: ["skidsteer", "loader"], // 🚫 car does NOT see skid/loader
      items: [
        { key: "no_new_damage", label: "No new damage to machine or attachment" },
        { key: "no_leaks", label: "No oil, hydraulic, or fuel leaks" },
        { key: "no_hydraulic_issues", label: "No hydraulic performance issues" },
        { key: "no_steering_brake_issues", label: "No steering or brake issues (if applicable)" },
        { key: "no_electrical_issues", label: "No electrical issues observed" },
        { key: "check_engine", label: "Check engine light illuminated" },
        { key: "diag_codes_displayed", label: "Diagnostic codes displayed" },
        { key: "diag_codes_list", label: "Diagnostic codes list" },
        { key: "no_overheating", label: "No overheating observed" },
        { key: "cleaned", label: "Machine cleaned of debris" },
        { key: "attachment_stored", label: "Attachment removed or stored properly" },
        { key: "bucket_lowered", label: "Bucket lowered to ground (if applicable)" },
        { key: "parking_brake", label: "Parking brake applied (if applicable)" },
        { key: "parked_designated", label: "Machine parked in designated area" },
      ],
    },
    {
      id: "trailer",
      title: "Trailer Inspection",
      applicableLabel: "Trailer Inspection Applicable",
      nameFieldLabel: "Trailer Name",
      vehicleTypes: ["truck"], // 🚫 car does NOT see trailers

      items: [
        { key: "coupler_pin_chains", label: "Coupler latched with pin; chains secured" },
        { key: "plug_lights", label: "7-way plug undamaged; lights operational" },
        { key: "tires_ok", label: "Tires correct PSI and good condition" },
        { key: "door_gate", label: "Door/gate closed and secured" },
      ],
    },
    {
      id: "plow",
      title: "Plow Inspection",
      applicableLabel: "Plow Inspection Applicable",
      nameFieldLabel: "Plow Type",
      vehicleTypes: ["truck", "loader", "skidsteer"], // 🚫 car does NOT see plows
      items: [
        { key: "mounted", label: "Plow securely mounted" },
        { key: "electrical", label: "Electrical connections secure" },
        { key: "hoses", label: "Hydraulic hoses in good condition" },
        { key: "controller", label: "Plow controller present" },
        { key: "functions", label: "Plow functions operational" },
        { key: "cutting_edge", label: "Cutting edge serviceable" },
        { key: "lights", label: "Plow lights operational" },
      ],
    },
    {
      id: "salter",
      title: "Salter Inspection",
      applicableLabel: "Salter Inspection Applicable",
      vehicleTypes: ["truck"], // 🚫 car does NOT see salter
      items: [
        { key: "electrical", label: "Salter electrical connections secure" },
        { key: "auger", label: "Conveyor/auger operates" },
        { key: "spinner", label: "Spinner operates" },
        { key: "controller", label: "Controller present" },
        { key: "material_flow", label: "Material flowing properly" },
      ],
    },
    
  ];

  const exitingItems: InspectionItem[] = [
    { key: "secured", label: "Truck, trailer, and/or equipment secured" },
    { key: "lights_off_locked", label: "Lights off & doors locked (if last person)" },
  ];

  return (
    <InspectionForm
      type="post-trip"
      title="New Daily Post-Trip Inspection Form"
      intro={intro}
      sections={sections}
      exitingItems={exitingItems}
      acknowledgementText={acknowledgement}
    />
  );
}
