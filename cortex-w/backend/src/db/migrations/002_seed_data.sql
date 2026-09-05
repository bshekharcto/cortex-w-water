-- Cortex-W seed data — BHUBANESWAR deployment, 04 Sep 2026 snapshot.
-- Loaded automatically after 001_initial_schema.sql by docker-entrypoint-initdb.d

INSERT INTO sites (id, name) VALUES (6394, 'BHUBANESWAR')
  ON CONFLICT (id) DO NOTHING;

-- 14 observed gateways from spec 18.1
INSERT INTO gateways (gateway_id, alias, site_id, meters_observed, linked_meters, avg_rssi, avg_snr, battery_abnormal, valve_abnormal, latest_decoded_at, latitude, longitude) VALUES
  ('506f9800000002a5', 'GW-Alpha',    6394, 738, 610, -88.6, -8.2,  277, 285, '2026-09-04T18:15:11.706179+00:00', 20.2961, 85.8245),
  ('506f9800000002a6', 'GW-Bravo',    6394, 403, 254, -89.7, -11.5, 160, 162, '2026-09-04T14:30:45.586050+00:00', 20.2750, 85.8400),
  ('506f98000000029a', 'GW-Charlie',  6394, 280, 272, -86.7, -9.5,   91, 101, '2026-09-04T17:53:04.073396+00:00', 20.3100, 85.8500),
  ('506f980000000262', 'GW-Delta',    6394, 251, 240, -94.4, -16.9, 101, 117, '2026-09-04T17:27:54.035774+00:00', 20.2800, 85.8100),
  ('506f980000000340', 'GW-Echo',     6394, 155, 139, -90.9, -15.1,  53,  65, '2026-09-04T07:07:09.786422+00:00', 20.3200, 85.8700),
  ('506f98000000029e', 'GW-Foxtrot',  6394, 153, 153, -86.2, -12.1,  57,  59, '2026-09-04T16:10:02.319930+00:00', 20.2650, 85.8350),
  ('506f980000000261', 'GW-Golf',     6394, 149, 143, -97.3, -16.5,  42,  71, '2026-09-04T06:42:01.779056+00:00', 20.3050, 85.8000),
  ('506f9800000002a8', 'GW-Hotel',    6394, 134, 129, -87.1, -12.6,  41,  53, '2026-09-04T10:56:13.093114+00:00', 20.2900, 85.8600),
  ('506f980000000299', 'GW-India',    6394, 130, 130, -85.0, -9.7,   34,  42, '2026-09-04T06:46:52.495037+00:00', 20.2700, 85.8150),
  ('506f9800000002a3', 'GW-Juliet',   6394, 107, 105, -91.3, -14.1,  29,  38, '2026-09-04T06:39:12.384423+00:00', 20.3150, 85.8450),
  ('506f98000000029d', 'GW-Kilo',     6394,  24,  21, -85.8, -15.4,  12,  13, '2026-09-04T06:30:08.125839+00:00', 20.2550, 85.8550),
  ('506f980000000341', 'GW-Lima',     6394,   5,   5, -89.2, -18.6,   2,   2, '2026-09-04T05:43:36.655979+00:00', 20.3300, 85.7900),
  ('506f980000000346', 'GW-Mike',     6394,   2,   2, -81.0, -18.1,   2,   2, '2026-09-04T04:51:37.449145+00:00', 20.2400, 85.8800),
  ('506f980000000297', 'GW-November', 6394,   1,   1, -90.0, -12.5,   0,   0, '2026-09-04T04:02:39.981281+00:00', 20.3400, 85.8050)
ON CONFLICT (gateway_id) DO NOTHING;

-- 10 representative meter rows from spec 18.2
INSERT INTO meters (meter_id, household_id, gateway_id, forward_flow_l, battery_voltage, battery_health, valve_health, rssi, snr, valve_status, decoded_at, meter_timestamp, site_id) VALUES
  ('0024004061', 'WS/BMC/1520247', '506f9800000002a3', 229.97, 3.6, 'Abnormal', 'Abnormal', -91, -17.8, 'Closed', '2026-09-04T03:16:27.388821+00:00', '2024-08-04 09:01:00', 6394),
  ('0024004067', 'WS/BMC/1490971', '506f980000000340', 27.93,  3.6, 'Normal',   'Abnormal', -91, -9.8,  'Open',   '2026-09-04T05:45:13.412919+00:00', '2029-11-04 09:01:01', 6394),
  ('0024004068', 'WS/BMC/1488809', '506f9800000002a8', 46.12,  3.6, 'Abnormal', 'Abnormal', -91, -18.8, 'Closed', '2026-09-04T06:10:13.956311+00:00', '2074-11-04 09:01:00', 6394),
  ('0024004081', 'WS/BMC/2500692', '506f9800000002a5', 38.63,  3.6, 'Normal',   'Normal',   -87, -14.0, 'Closed', '2026-09-04T03:21:43.885584+00:00', '2012-08-04 09:01:00', 6394),
  ('0024004083', 'WS/BMC/2490326', '506f9800000002a3', 0.07,   3.6, 'Normal',   'Abnormal', -91, -17.8, 'Open',   '2026-09-04T04:09:55.748170+00:00', '20142-09-04 09:59:04', 6394),
  ('0024004086', 'WS/BMC/1446931', '506f980000000261', 58.70,  3.6, 'Normal',   'Normal',   -97, -22.0, 'Open',   '2026-09-04T05:25:25.243329+00:00', '2017-10-04 09:01:00', 6394),
  ('0024004092', 'WS/BMC/1490019', '506f980000000340', 26.86,  3.6, 'Abnormal', 'Abnormal', -92, -9.8,  'Closed', '2026-09-04T03:46:36.285197+00:00', '2030-09-04 09:01:00', 6394),
  ('0024004094', 'WS/BMC/2379686', '506f980000000340', 612.35, 3.6, 'Normal',   'Normal',   -93, -19.5, 'Closed', '2026-09-04T04:34:15.693351+00:00', '2024-10-04 09:01:00', 6394),
  ('0024004099', 'WS/BMC/1507661', '506f980000000299', 172.09, 3.6, 'Abnormal', 'Abnormal', -87, -17.0, 'Closed', '2026-09-04T06:37:45.777374+00:00', '2023-12-04 09:01:01', 6394),
  ('0024004110', 'WS/BMC/2501194', '506f98000000029e', 1.66,   3.6, 'Normal',   'Abnormal', -90, -13.2, 'Open',   '2026-09-04T02:36:19.260166+00:00', '2044-08-04 09:59:04', 6394)
ON CONFLICT (meter_id) DO NOTHING;

-- Seed households
INSERT INTO households (custom_id, name, location, pin_code, status, registration_date, mobile, site_id, ward, locality) VALUES
  ('WS/BMC/1520247', 'Ramesh Patel',    'Ward 12, Old Town',           '751001', 'Active', '2025-06-15', '+91-9876543210', 6394, 'Ward 12', 'Old Town'),
  ('WS/BMC/1490971', 'Sunita Mohanty',  'Ward 8, Nayapalli',           '751012', 'Active', '2025-07-20', '+91-9876543211', 6394, 'Ward 8',  'Nayapalli'),
  ('WS/BMC/1488809', 'Ajay Sahoo',      'Ward 5, Saheed Nagar',        '751007', 'Active', '2025-08-01', '+91-9876543212', 6394, 'Ward 5',  'Saheed Nagar'),
  ('WS/BMC/2500692', 'Priya Das',       'Ward 14, Patia',              '751024', 'Active', '2025-05-10', '+91-9876543213', 6394, 'Ward 14', 'Patia'),
  ('WS/BMC/2490326', 'Manoj Behera',    'Ward 3, Chandrasekharpur',    '751016', 'Active', '2025-09-01', '+91-9876543214', 6394, 'Ward 3',  'Chandrasekharpur')
ON CONFLICT (custom_id) DO NOTHING;

-- Seed alarms from spec 13.5
INSERT INTO alarms (id, category, rule, severity, status, entity_type, entity_id, site, description, affected_count) VALUES
  ('ALM-001', 'Device Health',  'Battery Abnormal',    'high',     'Open', 'meter',   'fleet',            'BHUBANESWAR', 'Battery health reported as Abnormal', 901),
  ('ALM-002', 'Device Health',  'Valve Abnormal',      'high',     'Open', 'meter',   'fleet',            'BHUBANESWAR', 'Valve health reported as Abnormal', 1010),
  ('ALM-003', 'Communication',  'Weak SNR',            'medium',   'Open', 'meter',   'fleet',            'BHUBANESWAR', 'SNR below -10 dB marginal threshold', 1580),
  ('ALM-004', 'Communication',  'Weak RSSI',           'medium',   'Open', 'meter',   'fleet',            'BHUBANESWAR', 'RSSI below -90 dBm weak threshold', 800),
  ('ALM-005', 'Data Quality',   'Meter Clock Anomaly', 'medium',   'Open', 'meter',   '0024004083',       'BHUBANESWAR', 'MeterTimestamp is implausible (year 20142)', NULL),
  ('ALM-006', 'Data Quality',   'Meter Clock Anomaly', 'medium',   'Open', 'meter',   '0024004068',       'BHUBANESWAR', 'MeterTimestamp is far-future (year 2074)', NULL),
  ('ALM-007', 'Coverage',       'Unmapped Meter',      'low',      'Open', 'meter',   'fleet',            'BHUBANESWAR', 'Meter rows without Household ID', 328),
  ('ALM-008', 'Communication',  'Gateway Low Traffic', 'high',     'Open', 'gateway', '506f980000000341', 'BHUBANESWAR', 'Gateway GW-Lima hearing only 5 meters', NULL),
  ('ALM-009', 'Communication',  'Gateway Low Traffic', 'critical', 'Open', 'gateway', '506f980000000297', 'BHUBANESWAR', 'Gateway GW-November hearing only 1 meter', NULL)
ON CONFLICT (id) DO NOTHING;

-- Seed bills
INSERT INTO bills (household_id, asset_id, site_id, bill_date, due_date, prev_reading, current_reading, consumption, amount, status) VALUES
  ('WS/BMC/1520247', '0024004061', 6394, '2026-08-15', '2026-09-15', 217.57, 229.97, 12.40, 186.00, 'Pending'),
  ('WS/BMC/1490971', '0024004067', 6394, '2026-08-15', '2026-09-15', 19.73,  27.93,  8.20,  123.00, 'Paid'),
  ('WS/BMC/1488809', '0024004068', 6394, '2026-07-15', '2026-08-15', 30.42,  46.12,  15.70, 235.50, 'Overdue')
ON CONFLICT DO NOTHING;
