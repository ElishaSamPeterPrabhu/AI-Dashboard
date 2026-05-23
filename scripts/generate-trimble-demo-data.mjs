#!/usr/bin/env node
/**
 * Generates demo/trimble-demo-data.json — catalog for get_trimble_demo_data MCP tool.
 * Run: node scripts/generate-trimble-demo-data.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'demo', 'trimble-demo-data.json');

const catalog = {
  version: '1.0',
  generatedAt: new Date().toISOString(),
  products: {
    connect: {
      label: 'Trimble Connect',
      scenarios: {
        flight_tracking_app: {
          recordId: 'flight_tracking_app',
          label: 'Flight Tracking App Plan',
          fields: {
            projectName: 'Flight Tracking App V1',
            projectId: 'TC-PRJ-8842',
            owningOrg: 'Trimble Civil — Bengaluru',
            owningOrgId: 'civil_bengaluru',
            estimatedHours: '480',
            frontendHours: '200',
            backendHours: '300',
            testingHours: '100',
            projectBudget: '72000',
            teamSize: '6',
            hourlyRate: '75',
            sprintCount: '4',
            velocityPoints: '42',
            contingencyPct: '15',
          },
        },
        highway_expansion: {
          recordId: 'highway_expansion',
          label: 'Highway 47 Expansion',
          fields: {
            projectName: 'Highway 47 Expansion',
            projectId: 'TC-PRJ-1201',
            owningOrg: 'Transportation — Delhi NCR',
            owningOrgId: 'transport_delhi',
            estimatedHours: '3200',
            designHours: '800',
            constructionHours: '2100',
            inspectionHours: '300',
            projectBudget: '2400000',
            teamSize: '18',
            hourlyRate: '95',
            phaseCount: '3',
            riskBufferPct: '12',
          },
        },
      },
    },
    maps: {
      label: 'Trimble Maps',
      scenarios: {
        delhi_commute: {
          recordId: 'delhi_commute',
          label: 'India Gate → Cyber City commute',
          fields: {
            originAddress: 'India Gate, New Delhi',
            destAddress: 'Cyber City, Gurugram',
            distanceKm: '28.4',
            travelTimeMin: '45',
            workingDaysPerMonth: '24',
            busCostPerTrip: '15',
            autoCostPerTrip: '55',
            motorbikeFuelCostPerKm: '2.5',
            carFuelCostPerKm: '6.67',
            walkingCostPerMonth: '0',
            cyclingCostPerMonth: '0',
            tollCostPerTrip: '0',
          },
        },
        mumbai_local: {
          recordId: 'mumbai_local',
          label: 'CST → BKC local route',
          fields: {
            originAddress: 'Chhatrapati Shivaji Terminus, Mumbai',
            destAddress: 'Bandra Kurla Complex, Mumbai',
            distanceKm: '12.8',
            travelTimeMin: '38',
            workingDaysPerMonth: '22',
            busCostPerTrip: '12',
            autoCostPerTrip: '45',
            motorbikeFuelCostPerKm: '2.2',
            carFuelCostPerKm: '7.1',
            trainCostPerTrip: '25',
            parkingCostPerDay: '150',
          },
        },
      },
    },
    rates: {
      label: 'Trimble One / labour rates',
      scenarios: {
        us_engineering_2026: {
          recordId: 'us_engineering_2026',
          label: 'US engineering rate card 2026',
          fields: {
            currency: 'USD',
            engineerDailyRate: '800',
            seniorEngineerDailyRate: '950',
            pmDailyRate: '1100',
            qaEngDailyRate: '650',
            designerDailyRate: '720',
            architectDailyRate: '1050',
            overheadPct: '18',
            marginPct: '22',
          },
        },
        in_engineering_2026: {
          recordId: 'in_engineering_2026',
          label: 'India engineering rate card 2026',
          fields: {
            currency: 'INR',
            engineerDailyRate: '45000',
            seniorEngineerDailyRate: '62000',
            pmDailyRate: '75000',
            qaEngDailyRate: '38000',
            designerDailyRate: '42000',
            overheadPct: '15',
            marginPct: '20',
          },
        },
      },
    },
    site: {
      label: 'Trimble Viewpoint / site',
      scenarios: {
        site_block_3: {
          recordId: 'site_block_3',
          label: 'Site A — Block 3',
          fields: {
            siteName: 'Site A — Block 3',
            siteAreaSqM: '12000',
            materialCostPerSqM: '85',
            laborCostPerSqM: '45',
            equipmentCostPerDay: '3200',
            permitCost: '15000',
            inspectionCount: '6',
            weatherDelayDays: '4',
          },
        },
        warehouse_pad_2: {
          recordId: 'warehouse_pad_2',
          label: 'Warehouse pad — Phase 2',
          fields: {
            siteName: 'Warehouse Pad Phase 2',
            siteAreaSqM: '8500',
            materialCostPerSqM: '92',
            laborCostPerSqM: '52',
            equipmentCostPerDay: '4100',
            permitCost: '22000',
            concreteVolumeCuM: '640',
            rebarTonnes: '48',
          },
        },
      },
    },
    org: {
      label: 'Trimble Identity / org',
      scenarios: {
        civil_bengaluru: {
          recordId: 'civil_bengaluru',
          label: 'Trimble Civil — Bengaluru',
          fields: {
            orgId: 'civil_bengaluru',
            orgName: 'Trimble Civil — Bengaluru',
            division: 'Trimble Civil',
            location: 'Bengaluru',
            blrTeamSize: '12',
            blrAvgDailyRate: '750',
            blrUtilizationPct: '82',
            blrOpenRoles: '3',
            blrBenchCount: '2',
            fiscalYear: '2026',
          },
        },
        transport_delhi: {
          recordId: 'transport_delhi',
          label: 'Transportation — Delhi NCR',
          fields: {
            orgId: 'transport_delhi',
            orgName: 'Transportation — Delhi NCR',
            division: 'Trimble Transportation',
            location: 'Delhi NCR',
            delhiTeamSize: '8',
            delhiAvgDailyRate: '680',
            delhiUtilizationPct: '88',
            delhiOpenRoles: '1',
            delhiBenchCount: '1',
            fiscalYear: '2026',
          },
        },
      },
    },
    agri: {
      label: 'Trimble AgriData',
      scenarios: {
        wheat_punjab: {
          recordId: 'wheat_punjab',
          label: 'Wheat — Punjab pilot',
          fields: {
            cropType: 'Wheat',
            fieldAreaHa: '120',
            yieldTPerHa: '4.2',
            seedCostPerHa: '8500',
            fertilizerCostPerHa: '12000',
            fuelCostPerHa: '3200',
            laborCostPerHa: '6000',
            season: 'Rabi 2026',
          },
        },
      },
    },
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
