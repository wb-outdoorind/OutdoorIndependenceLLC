import assert from "node:assert/strict";
import test from "node:test";

import { syncEquipmentHoursForward, syncVehicleMileageForward } from "@/lib/assetReadings";

test("syncVehicleMileageForward uses RPC when available", async () => {
  let fromCalled = false;
  const supabase = {
    from: () => {
      fromCalled = true;
      throw new Error("from() should not be called when RPC succeeds");
    },
    rpc: async () => ({ data: 1234, error: null }),
  };

  const result = await syncVehicleMileageForward({
    supabase,
    vehicleId: "Truck_1",
    mileage: 1234,
  });

  assert.equal(result.ok, true);
  assert.equal(result.nextValue, 1234);
  assert.equal(fromCalled, false);
});

test("syncVehicleMileageForward falls back when RPC function is missing", async () => {
  let updateMileage: number | null = null;
  const supabase = {
    rpc: async () => ({ data: null, error: { message: "function sync_vehicle_mileage_forward does not exist" } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { mileage: 500 }, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        updateMileage = Number(values.mileage);
        return {
          eq: async () => ({ error: null }),
        };
      },
    }),
  };

  const result = await syncVehicleMileageForward({
    supabase,
    vehicleId: "Truck_1",
    mileage: 450,
  });

  assert.equal(result.ok, true);
  assert.equal(result.nextValue, 500);
  assert.equal(updateMileage, 500);
});

test("syncEquipmentHoursForward uses RPC when available", async () => {
  let fromCalled = false;
  const supabase = {
    from: () => {
      fromCalled = true;
      throw new Error("from() should not be called when RPC succeeds");
    },
    rpc: async () => ({ data: 87.5, error: null }),
  };

  const result = await syncEquipmentHoursForward({
    supabase,
    equipmentId: "Mower_1",
    hours: 87.5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.nextValue, 87.5);
  assert.equal(fromCalled, false);
});
