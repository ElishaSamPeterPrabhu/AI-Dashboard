# Trimble Division MCPs

This is the contact tracker and capability matrix for Trimble internal MCP integration. Until each MCP is available, the Test MCP provides a drop-in replacement.

---

## How to Onboard a Division MCP

1. Contact the division team (see below)
2. Get them to expose their data source as an MCP server using HTTP streamable transport + TID actor token auth
3. Provide the `mcpServerUrl`, tool schemas, and required TID scopes
4. Register as a node template in the dashboard node palette
5. Test against real data with a pilot user from that division

---

## Division MCP Registry

### Trimble Connect
- **What it provides:** CDE project data — documents, issues, clashes, RFIs, model coordination metadata, project member list, schedule milestones
- **Useful tools for simulation:** `get_project_summary`, `get_open_issues`, `get_schedule_status`, `list_project_members`, `get_model_coordination_status`
- **Auth scope:** `connect` (TID actor token)
- **Status:** Not started
- **Contact needed:** Trimble Connect team (to be identified)
- **Notes:** Connect already has an MCP server for the Modus Agent in `modus-blueprint` (`modus-docs-mcp`); same pattern needed for project data

---

### Trimble Viewpoint
- **What it provides:** Construction ERP — contracts, invoices, budget tracking, cost codes, committed cost vs budget, change orders, subcontractor data
- **Useful tools for simulation:** `get_contract_summary`, `get_budget_vs_actual`, `get_cost_forecast`, `list_change_orders`, `get_labor_cost_by_trade`
- **Auth scope:** `viewpoint` (TID actor token)
- **Status:** Not started
- **Contact needed:** Viewpoint team (to be identified)
- **Notes:** High value for construction budget simulation use cases; prioritize after Connect

---

### Trimble Construction One (TCO)
- **What it provides:** Integrated construction platform — project management, financials, field operations, resources
- **Useful tools for simulation:** `get_project_performance`, `get_resource_allocation`, `get_field_productivity`, `get_procurement_status`
- **Auth scope:** TBD
- **Status:** Not started
- **Contact needed:** TCO team

---

### Tekla Structures
- **What it provides:** BIM structural model data — model elements, clashes, quantities, materials, connections
- **Useful tools for simulation:** `get_clash_report`, `get_quantity_takeoff`, `get_model_summary`, `get_element_count_by_type`
- **Auth scope:** TBD
- **Status:** Not started
- **Contact needed:** Tekla team
- **Notes:** Built-in `tekla_help` tool already exists on the Agentic Platform; data MCP is separate

---

### SketchUp
- **What it provides:** Design model metadata — building components, areas, materials, IFC export data
- **Useful tools for simulation:** `get_model_summary`, `get_area_by_space_type`, `get_material_quantities`
- **Auth scope:** TBD
- **Status:** Not started
- **Contact needed:** SketchUp team

---

### Trimble Maps / Transportation
- **What it provides:** Routing, geocoding, traffic, fleet telematics, live vehicle positions
- **Useful tools for simulation:** `get_route_options`, `get_estimated_drive_time`, `get_traffic_conditions`, `get_fleet_positions`
- **Auth scope:** `maps` (TID actor token or API key — to verify)
- **Status:** Not started
- **Contact needed:** Trimble Maps team

---

### Trimble Agriculture
- **What it provides:** Field data, crop records, soil data, yield history, machine data, weather
- **Useful tools for simulation:** `get_field_summary`, `get_yield_history`, `get_soil_data`, `get_weather_forecast`
- **Auth scope:** TBD
- **Status:** Not started
- **Contact needed:** Trimble Agriculture team

---

### Trimble Geospatial
- **What it provides:** Survey data, point clouds, GIS layers, parcel data, infrastructure networks
- **Useful tools for simulation:** `get_parcel_info`, `get_survey_data`, `get_infrastructure_layers`
- **Auth scope:** TBD
- **Status:** Not started
- **Contact needed:** Trimble Geospatial team

---

## Capability Matrix

| Division | Cost data | Schedule data | Resource data | BIM/model data | Location/geo data | Field/site data |
|---|---|---|---|---|---|---|
| Trimble Connect | Partial | ✓ | Partial | ✓ (coordination) | ✗ | Partial |
| Trimble Viewpoint | ✓ | Partial | ✓ | ✗ | ✗ | Partial |
| TCO | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Tekla | ✓ (quantities) | ✗ | ✗ | ✓ | ✗ | ✗ |
| SketchUp | Partial | ✗ | ✗ | ✓ | ✗ | ✗ |
| Trimble Maps | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Agriculture | Partial | ✓ (seasonal) | Partial | ✗ | ✓ | ✓ |
| Geospatial | ✗ | ✗ | ✗ | Partial | ✓ | ✓ |

---

## Interim: Test MCP Coverage

Until division MCPs are available, the Test MCP provides stubs that match the expected output schemas so the full simulation pipeline works end-to-end in demos:

| Test MCP tool | Stubs for |
|---|---|
| `get_project_summary` | Connect + Viewpoint project health |
| `get_labor_rates` | Viewpoint labor cost data |
| `get_weather_history` | Construction schedule risk |
| `get_headcount_availability` | Resource allocation |
| `get_cost_estimate_benchmarks` | Estimating, budget modeling |
