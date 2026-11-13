import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer,type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { beforeAll,afterAll,beforeEach,afterEach,describe,expect,it } from 'vitest';

let container: StartedPostgreSqlContainer | undefined;
let client: Client | undefined;
const user = '00000000-0000-4000-8000-000000000001';
const customer = '00000000-0000-4000-8000-000000000010';
const range = '00000000-0000-4000-8000-000000000020';
const lab = '00000000-0000-4000-8000-000000000040';
const asset = '00000000-0000-4000-8000-000000000100';
const session = '00000000-0000-4000-8000-000000000200';
const volume = '00000000-0000-4000-8000-000000000300';
const lot = '00000000-0000-4000-8000-000000000400';

function connection() {
  if (!client) throw new Error('Integration database not initialized');
  return client;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16.11-alpine').start();
  client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  for (const file of ['001-create-tables','002-integrity','003-views','005-app-grants','006-snapshot-guards','007-instrument-type-identity']) await client.query(await readFile(`database/${file}.sql`,'utf8'));
  await fixtures();
});
afterAll(async () => { await client?.end(); await container?.stop(); });
beforeEach(async () => { await connection().query('BEGIN'); });
afterEach(async () => { await connection().query('ROLLBACK'); });

async function fixtures() {
  const conn = connection();
  await conn.query("INSERT INTO users(id,email,display_name,role,external_subject) VALUES($1,'test@example.org','Test engineer','admin','test-subject')",[user]);
  await conn.query("INSERT INTO customers(id,customer_name,department,address_1,email,phone_1,contact_name,created_by) VALUES($1,'Acme Labs','QC','Test address','qc@example.org','0000','QC lead',$2)",[customer,user]);
  await conn.query("INSERT INTO range_thresholds(id,range_label,range_min_ul,range_max_ul,channel,channel_count,make,model,times_to_test,repeats) VALUES($1,'2-20',2,20,'single',1,'Gilson','P20',3,1)",[range]);
  await conn.query("INSERT INTO range_threshold_limits(id,range_threshold_id,test_point_pct,nominal_volume_ul,inaccuracy_limit_pct,imprecision_limit_pct,captured_by) VALUES('00000000-0000-4000-8000-000000000021',$1,10,2,10,5,$2),('00000000-0000-4000-8000-000000000022',$1,50,10,2,1,$2),('00000000-0000-4000-8000-000000000023',$1,100,20,1,0.5,$2)",[range,user]);
  await conn.query("INSERT INTO instruments(id,instrument_type,make_model,serial_number,calibration_due_date) VALUES('00000000-0000-4000-8000-000000000030','balance','Balance','B-1','2027-01-01'),('00000000-0000-4000-8000-000000000031','air_thermometer','Air','A-1','2027-01-01'),('00000000-0000-4000-8000-000000000032','water_thermometer','Water','W-1','2027-01-01')");
  await conn.query("INSERT INTO lab_dimensions(id,process_date,calibrated_by_user_id,balance_instrument_id,air_instrument_id,water_thermometer_instrument_id,dd_water_temp_c,room_temp_c,humidity_pct,air_pressure_hpa,z_correction_value,z_source_version) VALUES($1,'2026-10-01',$2,'00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032',29.4,29.4,74,1008.8,1.0052,'test-verified')",[lab,user]);
  await conn.query("INSERT INTO assets(id,customer_id,range_threshold_id,serial_number,inventory_number,invoice_number,created_by) VALUES($1,$2,$3,'LK20869','TEST-1','TEST-INVOICE',$4)",[asset,customer,range,user]);
  await conn.query("INSERT INTO calibration_sessions(id,asset_id,customer_id,range_threshold_id,lab_dimension_id,process_date,next_calibration_months,due_date,reminder_date,created_by) VALUES($1,$2,$3,$4,$5,'2026-10-01',12,'2027-09-30','2027-08-31',$6)",[session,asset,customer,range,lab,user]);
  await conn.query("INSERT INTO calibration_volume_results(id,calibration_session_id,asset_id,range_threshold_limit_id,nominal_volume_ul,inaccuracy_limit_pct,imprecision_limit_pct) VALUES($1,$2,$3,'00000000-0000-4000-8000-000000000021',2,10,5)",[volume,session,asset]);
  await conn.query('INSERT INTO calibration_lots(id,calibration_volume_result_id,calibration_session_id,asset_id,nominal_volume_ul,lot_no) VALUES($1,$2,$3,$4,2,1)',[lot,volume,session,asset]);
}

describe('FR-01 FR-05 database inventory constraints', () => {
  it('rejects a case-insensitive duplicate customer', async () => {
    await expect(connection().query("INSERT INTO customers(customer_name,department,address_1,email,phone_1,contact_name,created_by) VALUES('ACME LABS','qc','Test','qc@example.org','0000','QC',$1)",[user])).rejects.toMatchObject({ code: '23505' });
  });
  it('allows the same pipette serial in a new job', async () => {
    await expect(connection().query("INSERT INTO assets(customer_id,range_threshold_id,serial_number,inventory_number,invoice_number,created_by) VALUES($1,$2,'LK20869','TEST-2','INV-2',$3)",[customer,range,user])).resolves.toBeDefined();
  });
  it('rejects duplicate inventory numbers', async () => {
    await expect(connection().query("INSERT INTO assets(customer_id,range_threshold_id,serial_number,inventory_number,invoice_number,created_by) VALUES($1,$2,'OTHER','TEST-1','INV-2',$3)",[customer,range,user])).rejects.toMatchObject({ code: '23505' });
  });
});

describe('Instrument identity and reuse', () => {
  it('allows air and water thermometers with the same serial and due date', async () => {
    await expect(connection().query("INSERT INTO instruments(instrument_type,make_model,serial_number,calibration_due_date) VALUES('water_thermometer','Dual thermometer','A-1','2027-01-01')")).resolves.toBeDefined();
  });
  it('rejects duplicate versions of the same instrument type and serial', async () => {
    await expect(connection().query("INSERT INTO instruments(instrument_type,make_model,serial_number,calibration_due_date) VALUES('air_thermometer','Air','A-1','2027-01-01')")).rejects.toMatchObject({ code: '23505' });
  });
  it('preserves new calibration versions without changing old instrument references', async () => {
    await expect(connection().query("INSERT INTO instruments(instrument_type,make_model,serial_number,calibration_due_date) VALUES('air_thermometer','Air','A-1','2028-01-01')")).resolves.toBeDefined();
  });
  it('reuses all three instruments in another sitting on another date', async () => {
    await expect(connection().query("INSERT INTO lab_dimensions(process_date,calibrated_by_user_id,balance_instrument_id,air_instrument_id,water_thermometer_instrument_id,dd_water_temp_c,room_temp_c,humidity_pct,air_pressure_hpa,z_correction_value,z_source_version) SELECT '2026-10-02',calibrated_by_user_id,balance_instrument_id,air_instrument_id,water_thermometer_instrument_id,dd_water_temp_c,room_temp_c,humidity_pct,air_pressure_hpa,z_correction_value,z_source_version FROM lab_dimensions WHERE id=$1",[lab])).resolves.toBeDefined();
  });
});

describe('FR-09 FR-13 FR-15 FR-17 traceability and session guards', () => {
  it('rejects a second active session', async () => {
    await expect(connection().query("INSERT INTO calibration_sessions(asset_id,customer_id,range_threshold_id,lab_dimension_id,session_no,process_date,next_calibration_months,due_date,reminder_date,created_by) VALUES($1,$2,$3,$4,2,'2026-10-01',12,'2027-09-30','2027-08-31',$5)",[asset,customer,range,lab,user])).rejects.toMatchObject({ code: '23505' });
  });
  it('rejects reading number eleven', async () => {
    await expect(connection().query('INSERT INTO calibration_readings(calibration_lot_id,calibration_session_id,asset_id,reading_no,mass_g,volume_ul) VALUES($1,$2,$3,11,0.002,2.0104)',[lot,session,asset])).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects a wrong asset ancestry', async () => {
    await expect(connection().query("INSERT INTO calibration_readings(calibration_lot_id,calibration_session_id,asset_id,reading_no,mass_g,volume_ul) VALUES($1,$2,'00000000-0000-4000-8000-000000000999',1,0.002,2.0104)",[lot,session])).rejects.toMatchObject({ code: '23503' });
  });
  it('rejects arbitrary client-derived volume', async () => {
    await expect(connection().query('INSERT INTO calibration_readings(calibration_lot_id,calibration_session_id,asset_id,reading_no,mass_g,volume_ul) VALUES($1,$2,$3,1,0.002,999)',[lot,session,asset])).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects certification of an incomplete session', async () => {
    await expect(connection().query("INSERT INTO asset_certifications(asset_id,customer_id,calibration_session_id,storage_key,sha256,template_version,generated_by,idempotency_key) VALUES($1,$2,$3,'test.pdf',repeat('0',64),'test',$4,gen_random_uuid())",[asset,customer,session,user])).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects incomplete completion', async () => {
    await expect(connection().query("UPDATE calibration_sessions SET status='completed',end_time=now(),final_status='pass',inaccuracy_status='pass',imprecision_status='pass' WHERE id=$1",[session])).rejects.toMatchObject({ code: '23514' });
  });
});

describe('FR-20 FR-24 snapshots and append-only audit', () => {
  it('rejects changing an instrument referenced by lab conditions', async () => {
    await expect(connection().query("UPDATE instruments SET calibration_due_date='2030-01-01' WHERE serial_number='B-1'")).rejects.toMatchObject({ code: '23514' });
  });
  it('rejects audit update by the application privilege role', async () => {
    await connection().query('SET LOCAL ROLE vfl_app');
    await expect(connection().query("UPDATE audit_logs SET action='tampered'")).rejects.toMatchObject({ code: '42501' });
  });
  it('rejects hard deletion of business data', async () => {
    await expect(connection().query('DELETE FROM assets WHERE id=$1',[asset])).rejects.toMatchObject({ code: '23514' });
  });
});