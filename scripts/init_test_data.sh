#!/bin/bash
# Initialize complete test data for htDash

echo "Initializing test data..."
echo ""

# Step 1: Create device directories and inventory
echo "Step 1: Creating device inventory and assignment files..."
mkdir -p data/ranipet/devices/{inventory,assignments,logs}
echo "  Done"

# Note: inventory and assignment JSON files should already exist from the initial setup
# If they don't, they will be re-created by reset_test_patient.py

# Step 2: Reset patients to enrolled state
echo ""
echo "Step 2: Resetting test patients to enrolled state..."
python scripts/reset_test_patient.py 08/04 08/04 08/04 08/04

# Step 3: Advance patient states
echo ""
echo "Step 3: Advancing patient states..."
python scripts/setup_test_data.py

# Step 4: Assign devices
echo ""
echo "Step 4: Assigning devices..."
python scripts/assign_test_devices.py

echo ""
echo "All done! Test data is ready for interactive testing."
echo ""
echo "Patient states:"
echo "  HOCMCV002 (experimental, day 7)  — followup_call_d07 due today"
echo "  HOCMCV003 (experimental, day 1)  — activation done, day-1 modals ready"
echo "  HOCMCV004 (control, day 15)      — day-15 cluster ready"
echo "  HOCMCV005 (control, inactive)    — ready for activation flow"
