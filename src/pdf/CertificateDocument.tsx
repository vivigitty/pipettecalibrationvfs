import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import type { ReactNode } from 'react';
import Decimal from 'decimal.js';
import { format, parseISO } from 'date-fns';
import type { CertificateData } from '@/schemas/certificate';

// ============================================================
// CONSTANTS
// ============================================================

const EMPTY_TEXT = 'Nil';

const COMPANY_NAME = 'VFL Sciences Private Limited';

const COMPANY_ADDRESS =
  '3rd floor, Kanagamani Complex, Plot No 6, 200ft road, Ponniammanmedu, Madhavaram, Chennai 600110';

const COMPANY_EMAIL = 'info@vflsciences.com';

const COMPANY_WEBSITE = 'www.vflsciences.com';

const COMPANY_CIN = 'U28299TN2023PTC163152';

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingHorizontal: 42,
    paddingBottom: 95,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: '#111111',
  },

  // ----------------------------------------------------------
  // Header
  // ----------------------------------------------------------

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    minHeight: 38,
    marginBottom: 3,
  },

  customerBlock: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingRight: 10,
    fontSize: 7.5,
    lineHeight: 1.1,
  },

  customerName: {
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1.2,
    marginBottom: 3,
  },

  logo: {
    width: 64,
    height: 64,
    flexShrink: 0,
    backgroundColor: '#ffffff',
    objectFit: 'contain',
  },

  certificateTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 2,
    marginBottom: 4,
  },

  inventoryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 5,
    borderTopWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: '#444444',
  },

  // ----------------------------------------------------------
  // General text
  // ----------------------------------------------------------

  bold: {
    fontWeight: 700,
  },

  // ----------------------------------------------------------
  // Pipette details
  // ----------------------------------------------------------

  details: {
    marginBottom: 6,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 14,
  },

  detailLabel: {
    width: '22%',
  },

  detailValue: {
    width: '30%',
    fontWeight: 700,
  },

  detailExtra: {
    flex: 1,
    fontWeight: 700,
  },

  // ----------------------------------------------------------
  // Tables
  // ----------------------------------------------------------

  table: {
    borderTopWidth: 0.6,
    borderLeftWidth: 0.6,
    borderColor: '#444444',
  },

  tableRow: {
    flexDirection: 'row',
  },

  tableCell: {
    paddingVertical: 2.5,
    paddingHorizontal: 2,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#555555',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  },

  tableHeader: {
    fontWeight: 700,
    textAlign: 'center',
  },

  volumeGroup: {
    flexDirection: 'row',
  },

  // ----------------------------------------------------------
  // Results tables
  // ----------------------------------------------------------

  resultsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 7,
  },

  resultTable: {
    width: '49%',
  },

  // ----------------------------------------------------------
  // Formula and environmental information
  // ----------------------------------------------------------

  formula: {
    fontWeight: 700,
    marginBottom: 6,
  },

  environmentalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },

  envLabel: {
    fontWeight: 700,
  },

  envValue: {
    textAlign: 'center',
  },

  // ----------------------------------------------------------
  // Equipment
  // ----------------------------------------------------------

  equipmentRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start',
  },

  equipmentLabel: {
    width: '25%',
    fontWeight: 700,
  },

  equipmentValue: {
    flex: 1,
  },

  // ----------------------------------------------------------
  // Service and certification details
  // ----------------------------------------------------------

  serviceSection: {
    marginTop: 3,
    borderTopWidth: 0.6,
    borderColor: '#555555',
    paddingTop: 5,
  },

  serviceRow: {
    flexDirection: 'row',
    minHeight: 14,
    alignItems: 'center',
  },

  serviceLabel: {
    width: '25%',
  },

  serviceValue: {
    flex: 1,
    fontWeight: 700,
  },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    marginBottom: 3,
  },

  dateItem: {
    flex: 1,
  },

 signatureBlock: {
  marginTop: 8,
  alignItems: 'flex-end',
  paddingRight: 8,
},

signatureImage: {
  width: 90,
  height: 28,
  objectFit: 'contain',
},

signature: {
  fontWeight: 700,
},

signatureDate: {
  marginTop: 2,
},

  // ----------------------------------------------------------
  // Footer
  // ----------------------------------------------------------

  footer: {
    position: 'absolute',
    bottom: 23,
    left: 42,
    right: 42,
    alignItems: 'center',
    fontSize: 6.5,
    lineHeight: 1.35,
    textAlign: 'center',
  },

  footerCompany: {
    fontWeight: 700,
  },

  footerCustom: {
    marginBottom: 3,
  },
});

// ============================================================
// FORMAT HELPERS
// ============================================================

const display = (
  value: string | number,
  places: number,
): string => {
  return new Decimal(value).toFixed(places);
};

const date = (value: string): string => {
  return format(parseISO(value), 'd-MMM-yy');
};

const nil = (
  value: string | null | undefined,
  empty = EMPTY_TEXT,
): string => {
  const normalized =
    typeof value === 'string' ? value.trim() : '';

  return normalized || empty;
};

const instrument = (
  value: CertificateData['balance'],
): string => {
  return (
    `${nil(value.makeModel)} / ` +
    `S.No: ${nil(value.serialNumber)} / ` +
    `Cal due : ${format(
      parseISO(value.calibrationDueDate),
      'dd-MM-yyyy',
    )}`
  );
};

// ============================================================
// REUSABLE TABLE CELL
// ============================================================

function Cell({
  children,
  width,
  header = false,
  height,
}: {
  children: ReactNode;
  width: string;
  header?: boolean;
  height?: number;
}) {
  return (
    <View
      style={[
        styles.tableCell,
        { width },
        height !== undefined ? { height } : {},
      ]}
    >
      <Text style={header ? styles.tableHeader : {}}>
        {children}
      </Text>
    </View>
  );
}

// ============================================================
// ADAPTIVE READING TABLE
//
// Supports 1, 2 or 3 volume sets.
// Each volume set has Mass and Actual Volume columns.
// Column widths are automatically calculated.
// ============================================================

function ReadingTable({
  data,
}: {
  data: CertificateData;
}) {
  const volumeCount = data.volumes.length;

  const count = Math.max(
    0,
    ...data.volumes.map((volume) => volume.readings.length),
  );

  const serialWidth = 10;

  const volumeGroupWidth =
    volumeCount > 0
      ? (100 - serialWidth) / volumeCount
      : 90;

  const serialStyle = `${serialWidth}%`;
  const groupStyle = `${volumeGroupWidth}%`;

  return (
    <View style={styles.table}>

      {/* First header row: Volume set names */}

      <View style={styles.tableRow}>
        <Cell
          width={serialStyle}
          header
          height={25}
        >
          Sl.No.
        </Cell>

        {data.volumes.map((volume) => (
          <Cell
            key={volume.nominalVolumeUl}
            width={groupStyle}
            header
            height={25}
          >
            Volume Set {display(volume.nominalVolumeUl, 0)} µL
          </Cell>
        ))}
      </View>

      {/* Second header row: Mass and Actual Volume */}

      <View style={styles.tableRow}>
        <Cell width={serialStyle} header height={23}>
          {''}
        </Cell>
        {data.volumes.map((volume) => (
          <View
            key={volume.nominalVolumeUl}
            style={[
              styles.volumeGroup,
              { width: groupStyle },
            ]}
          >
            <Cell
              width="50%"
              header
              height={23}
            >
              Mass (gm)
            </Cell>

            <Cell
              width="50%"
              header
              height={23}
            >
              Actual Volume (µL)
            </Cell>
          </View>
        ))}
      </View>

      {/* Reading rows */}

      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={styles.tableRow}
          wrap={false}
        >
          {/* Serial number */}

          <Cell width={serialStyle}>
            {index + 1}
          </Cell>

          {/* Volume measurements */}

          {data.volumes.map((volume) => {
            const reading = volume.readings[index];

            return (
              <View
                key={volume.nominalVolumeUl}
                style={[
                  styles.volumeGroup,
                  { width: groupStyle },
                ]}
              >
                <Cell width="50%">
                  {reading
                    ? display(reading.massG, 4)
                    : ''}
                </Cell>

                <Cell width="50%">
                  {reading
                    ? display(reading.volumeUl, 2)
                    : ''}
                </Cell>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ============================================================
// ACCURACY AND PRECISION TABLES
// ============================================================

function ResultTable({
  data,
  type,
}: {
  data: CertificateData;
  type: 'inaccuracy' | 'imprecision';
}) {
  const isInaccuracy = type === 'inaccuracy';

  const actualLabel = isInaccuracy
    ? 'Inaccuracy Actual(%)'
    : 'Imprecision Actual(%)';

  const limitLabel = isInaccuracy
    ? 'Inaccuracy Limit'
    : 'Imprecision Limit';

  return (
    <View style={[styles.table, styles.resultTable]}>

      <View style={styles.tableRow}>
        <Cell width="28%" header>
          Volume (µL)
        </Cell>

        <Cell width="39%" header>
          {actualLabel}
        </Cell>

        <Cell width="33%" header>
          {limitLabel}
        </Cell>
      </View>

      {data.volumes.map((volume) => {
        const actual = isInaccuracy
          ? volume.inaccuracyActualPct
          : volume.imprecisionActualPct;

        const limit = isInaccuracy
          ? volume.inaccuracyLimitPct
          : volume.imprecisionLimitPct;

        return (
          <View
            key={volume.nominalVolumeUl}
            style={styles.tableRow}
            wrap={false}
          >
            <Cell width="28%">
              {display(volume.nominalVolumeUl, 0)}
            </Cell>

            <Cell width="39%">
              {display(actual, 4)}
            </Cell>

            <Cell width="33%">
              +/- {display(limit, 1)}%
            </Cell>
          </View>
        );
      })}
    </View>
  );
}

// ============================================================
// MAIN CERTIFICATE DOCUMENT
// ============================================================

export function CertificateDocument({
  data,
}: {
  data: CertificateData;
}) {
  return (
    <Document
      title={`Calibration ${data.inventoryNumber}`}
      author={COMPANY_NAME}
    >
      <Page
        size="LETTER"
        style={styles.page}
      >

        {/* ==================================================
            HEADER
        ================================================== */}

        <View style={styles.header}>
          <View style={styles.customerBlock}>
            <Text style={styles.customerName}>
              {nil(data.customerName, '')}
            </Text>

            <Text>
              {nil(data.address1, '')}
            </Text>

            <Text>
              {nil(data.address2, '')}
            </Text>

            <Text>
              {nil(data.department, '')}
            </Text>
          </View>

          {data.logoUrl ? (
            <Image
              src={data.logoUrl}
              style={styles.logo}
            />
          ) : null}
        </View>

        <Text style={styles.certificateTitle}>
          Calibration Certificate
        </Text>

        <View style={styles.inventoryRow}>
          <Text style={styles.bold}>
            Inventory No.:
          </Text>

          <Text style={{ marginLeft: 12 }}>
            {nil(data.inventoryNumber, '')}
          </Text>
        </View>

        {/* ==================================================
            CERTIFICATE AND CUSTOMER DETAILS
        ================================================== */}

        <View style={styles.details}>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Pipette Manufacturer
            </Text>

            <Text style={styles.detailValue}>
              {nil(data.make)}
            </Text>

            <Text style={styles.detailExtra}>
              Number of Channels: {nil(data.channel)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Pipette Details
            </Text>

            <Text style={styles.detailValue}>
              {nil(data.model)}
            </Text>

            <Text style={styles.detailExtra}>
              Range: {nil(data.rangeLabel)} µL
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              In Use at
            </Text>

            <Text style={styles.detailValue}>
              {nil(data.department)}
            </Text>

            <Text style={styles.detailExtra}>
              Serial Number: {nil(data.serialNumber)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{''}</Text>
            <Text style={styles.detailValue}>{''}</Text>

            <Text style={styles.detailExtra}>
              Customer ID: {nil(data.customerAssetId)}
            </Text>
          </View>
        </View>

        {/* ==================================================
            READING TABLE
        ================================================== */}

        <ReadingTable data={data} />

        {/* ==================================================
            INACCURACY AND IMPRECISION
        ================================================== */}

        <View style={styles.resultsContainer}>
          <ResultTable
            data={data}
            type="inaccuracy"
          />

          <ResultTable
            data={data}
            type="imprecision"
          />
        </View>

        {/* ==================================================
            CALCULATION FORMULA
        ================================================== */}

        <Text style={styles.formula}>
          Actual Volume (µL) = Mass Read * Z Factor * 1000
        </Text>

        {/* ==================================================
            ENVIRONMENTAL CONDITIONS
        ================================================== */}
      <View style={[styles.table, { marginBottom: 8 }]}>
        <View style={styles.tableRow}>
          <Cell width="20%" header>DD Water Temp (°C)</Cell>
          <Cell width="20%" header>Room Temp (°C)</Cell>
          <Cell width="20%" header>Humidity (%)</Cell>
          <Cell width="20%" header>"Z" Correction (µL/mg)</Cell>
          <Cell width="20%" header>Air Pressure (hPa)</Cell>
        </View>
        <View style={styles.tableRow}>
          <Cell width="20%">{display(data.ddWaterTempC, 1)}</Cell>
          <Cell width="20%">{display(data.roomTempC, 1)}</Cell>
          <Cell width="20%">{display(data.humidityPct, 0)}</Cell>
          <Cell width="20%">{display(data.zCorrectionValue, 4)}</Cell>
          <Cell width="20%">{display(data.airPressureHpa, 1)}</Cell>
        </View>
      </View>


        {/* ==================================================
            EQUIPMENT DETAILS
        ================================================== */}

        <View style={styles.equipmentRow}>
          <Text style={styles.equipmentLabel}>
            Balance Used:
          </Text>

          <Text style={styles.equipmentValue}>
            {instrument(data.balance)}
          </Text>
        </View>

        <View style={styles.equipmentRow}>
          <Text style={styles.equipmentLabel}>
            Thermometer Used:
          </Text>

          <Text style={styles.equipmentValue}>
            Air - {instrument(data.air)}
            {' / '}
            Water - {instrument(data.water)}
          </Text>
        </View>

        {/* ==================================================
            SERVICE AND MAINTENANCE DETAILS
        ================================================== */}

        <View style={styles.serviceSection}>

          <View style={styles.serviceRow}>
            <Text style={styles.serviceLabel}>
              Damaged /Missing parts identified:
            </Text>

            <Text style={styles.serviceValue}>
              {nil(data.damagedParts)}
            </Text>
          </View>

          <View style={styles.serviceRow}>
            <Text style={styles.serviceLabel}>
              Parts Replaced:
            </Text>

            <Text style={styles.serviceValue}>
              {nil(data.replacedParts)}
            </Text>
          </View>

          <View style={[styles.serviceRow, { marginTop: 7 }]}>
            <Text style={styles.serviceLabel}>
              Status:
            </Text>

            <Text style={styles.serviceValue}>
              Pass
            </Text>
          </View>

          <View style={styles.serviceRow}>
            <Text style={styles.serviceLabel}>
              Serviced by:
            </Text>

            <Text style={styles.serviceValue}>
              {nil(data.servicedBy)}
            </Text>
          </View>

          {/* Calibration dates */}

          <View style={styles.dateRow}>
            <Text style={styles.dateItem}>
              Date of Calibration: {date(data.processDate)}
            </Text>
          </View>

          <View style={styles.dateRow}>
            <Text style={styles.dateItem}>
              Next Calibration Due: {date(data.dueDate)}
            </Text>
          </View>

          {/* Authorised signatory */}

          <View style={styles.signatureBlock}>
            {data.signatureUrl ? (
              <Image src={data.signatureUrl} style={styles.signatureImage} />
            ) : null}
            <Text style={[styles.signature, data.signatureUrl ? {} : { marginTop: 14 }]}>
              Authorised Signatory ____________________
            </Text>
            {data.signatureDate ? (
              <Text style={styles.signatureDate}>Date: {date(data.signatureDate)}</Text>
            ) : null}
          </View>
        </View>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <View
          fixed
          style={styles.footer}
        >
          <Text style={styles.footerCustom}>
            {nil(data.footer, '')}
          </Text>

          <Text style={styles.footerCompany}>
            {COMPANY_NAME}
          </Text>

          <Text>
            {COMPANY_ADDRESS}
          </Text>

          <Text>
            Email: {COMPANY_EMAIL}  Website: {COMPANY_WEBSITE}
          </Text>

          <Text>
            CIN: {COMPANY_CIN}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
