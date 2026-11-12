import { Document,Image,Page,StyleSheet,Text,View } from '@react-pdf/renderer';
import Decimal from 'decimal.js';
import { format,parseISO } from 'date-fns';
import type { CertificateData } from '@/schemas/certificate';

const styles = StyleSheet.create({
  page: { padding: 26,fontFamily: 'Helvetica',fontSize: 9,color: '#111111' },
  header: { flexDirection: 'row',justifyContent: 'space-between',alignItems: 'flex-start',marginBottom: 10 },
  titleBlock: { flexGrow: 1,paddingRight: 10 },
  title: { fontSize: 17,marginBottom: 4,fontWeight: 700 },
  logo: { width: 120,height: 46,objectFit: 'contain' },
  factLine: { marginBottom: 2 },
  subHeading: { marginTop: 8,fontWeight: 700 },
  row: { flexDirection: 'row',borderBottomWidth: 0.5,borderColor: '#555555' },
  cell: { flexGrow: 1,flexBasis: 0,padding: 4,borderRightWidth: 0.5,borderColor: '#555555' },
  table: { borderTopWidth: 0.5,borderLeftWidth: 0.5,borderColor: '#555555',marginVertical: 8 },
  block: { marginVertical: 4 },
  footer: { position: 'absolute',bottom: 14,left: 26,right: 26,fontSize: 7 },
});
const EMPTY_TEXT = 'Nil';
const display = (value: string, places: number) => new Decimal(value).toFixed(places);
const date = (value: string) => format(parseISO(value),'d-MMM-yy');
const instrument = (value: CertificateData['balance']) => `${value.makeModel} / S.No: ${value.serialNumber} / Cal due : ${format(parseISO(value.calibrationDueDate),'dd-MM-yyyy')}`;
const nil = (value: string | null | undefined, empty = EMPTY_TEXT) => {
  const normalized = typeof value==='string' ? value.trim() : '';
  return normalized ? normalized : empty;
};

function ReadingTable({ data }: { data: CertificateData }) {
  const count = Math.max(...data.volumes.map((volume) => volume.readings.length));
  return <View style={styles.table}>
    <View style={styles.row} fixed><Text style={styles.cell}>Sl.No.</Text>{data.volumes.map((volume) => <Text key={volume.nominalVolumeUl} style={styles.cell}>Volume Set {volume.nominalVolumeUl} uL | Mass (gm) / Actual Volume (uL)</Text>)}</View>
    {Array.from({ length: count },(_,index) => <View key={index} style={styles.row} wrap={false}>
      <Text style={styles.cell}>{index+1}</Text>{data.volumes.map((volume) => {
        const reading = volume.readings[index];
        return <Text key={volume.nominalVolumeUl} style={styles.cell}>{reading ? `${display(reading.massG,4)} / ${display(reading.volumeUl,2)}` : ''}</Text>;
      })}
    </View>)}
  </View>;
}

/** FR-25/26: database-derived certificate draft; visual approval is a release gate. */
export function CertificateDocument({ data }: { data: CertificateData }) {
  return <Document title={`Calibration ${data.inventoryNumber}`}><Page size="LETTER" style={styles.page}>
    <View style={styles.header}><View style={styles.titleBlock}><Text style={styles.title}>Calibration Certificate</Text><Text>{nil(data.customerName,'')}</Text><Text>{nil(data.address1,'')}</Text><Text>{nil(data.address2,'')}</Text><Text>{nil(data.department,'')}</Text></View>{data.logoUrl ? <Image src={data.logoUrl} style={styles.logo} /> : null}</View>
    <Text style={styles.factLine}>Inventory No.: {nil(data.inventoryNumber,'')}</Text>
    <Text style={styles.factLine}>Session No.: {data.sessionNo}</Text>
    <Text style={styles.factLine}>Pipette Manufacturer: {nil(data.make)}</Text>
    <Text style={styles.factLine}>Pipette Details: {nil(data.model)}</Text>
    <Text style={styles.factLine}>No. of Channel: {nil(data.channel)}</Text>
    <Text style={styles.factLine}>Range: {nil(data.rangeLabel)} uL</Text>
    <Text style={styles.factLine}>S.No.: {nil(data.serialNumber)}</Text>
    <Text style={styles.factLine}>Cust ID No.: {nil(data.customerAssetId)}</Text>
    <Text style={styles.factLine}>Invoice No.: {nil(data.invoiceNumber)}</Text>
    <Text style={styles.factLine}>Contact: {nil(data.contactName)}</Text>
    <Text style={styles.factLine}>Email: {nil(data.email)}</Text>
    <Text style={styles.factLine}>Phone 1: {nil(data.phone1)} | Phone 2: {nil(data.phone2)}</Text>
    <Text style={styles.factLine}>Service Mode: {nil(data.serviceMode)}</Text>
    <ReadingTable data={data} />
    <View wrap={false}>
      <View style={styles.table}><View style={styles.row}>{['Volume (uL)','Inaccuracy Actual(%)','Inaccuracy Limit','Imprecision Actual(%)','Imprecision Limit'].map((label) => <Text key={label} style={styles.cell}>{label}</Text>)}</View>
        {data.volumes.map((volume) => <View key={volume.nominalVolumeUl} style={styles.row}>{[volume.nominalVolumeUl,display(volume.inaccuracyActualPct,4),`+/- ${display(volume.inaccuracyLimitPct,1)}%`,display(volume.imprecisionActualPct,4),`+/- ${display(volume.imprecisionLimitPct,1)}%`].map((value,index) => <Text key={index} style={styles.cell}>{value}</Text>)}</View>)}
      </View>
      <Text style={styles.block}>Actual Volume (uL) = Mass Read * Z Factor * 1000</Text>
      <Text>DD waterTemperature: {display(data.ddWaterTempC,1)} C | Room temp: {display(data.roomTempC,1)} C | Humidity: {display(data.humidityPct,0)}%</Text>
      <Text>"Z" Correction Value: {display(data.zCorrectionValue,4)} uL/mg | Air pressure: {display(data.airPressureHpa,1)} hPa</Text>
      <Text style={styles.block}>Balance Used: {instrument(data.balance)}</Text><Text>Thermometer Used: Air - {instrument(data.air)} / Water - {instrument(data.water)}</Text>
      <Text style={styles.block}>Damaged /Missing parts identified: {nil(data.damagedParts)}</Text><Text>Parts Replaced: {nil(data.replacedParts)}</Text>
      <Text style={styles.block}>Status: Pass | Serviced by: {nil(data.servicedBy)}</Text><Text>Date of Calibration: {date(data.processDate)} | Reminder Date: {date(data.reminderDate)} | Next Calibration Due: {date(data.dueDate)}</Text>
      <Text style={{ marginTop: 32 }}>Authorised Signatory ____________________</Text>
    </View>
    <Text fixed style={styles.footer} render={({ pageNumber,totalPages }) => `${data.footer}\nInventory No. ${data.inventoryNumber} | Page ${pageNumber} of ${totalPages}`} />
  </Page></Document>;
}