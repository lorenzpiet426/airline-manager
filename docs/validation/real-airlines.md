# Validation report: real airlines

Generated 2026-10-27 by `tools/build-validation-report.ts`. Our data: routes from Wikipedia airport
articles, fleets from airline articles (CC BY-SA 4.0); weekly flights = Eurostat S24 route totals split between
airlines (estimate). Compared with independent sources; **every difference is listed** so you can spot-check by hand
(e.g. Planespotters, FlightConnections). Nothing here is copied from those sites.

## Austrian Airlines (AUA)

Hubs: VIE · Bases: 0 · Routes in our network: 144

### Destinations

Our network serves **139** airports (besides the hubs); Wikipedia's "List of Austrian Airlines destinations" (rev. 1381874253) lists **130** active.

- In the destination list, **missing in our network** (6): BDS, BSL, CUN, FUE, IST, NUE
- In our network, but **ended** according to the list (6): BLL, BOJ, GRZ, MJT, TOS, ZAG
- In our network, **not in the list at all** (9): ALC, BGO, BIA, BIO, CLY, EVE, GOA, IVL, PDL

### Weekly flights from VIE (estimate vs. all airlines, Eurostat S24)

| Route | Ours (estimate) | All airlines (official) | Note |
|---|---|---|---|
| VIE–BER | 68.5 | 68.4 | no other airline known on this route |
| VIE–ZRH | 59.5 | 59.6 | no other airline known on this route |
| VIE–VCE | 30.5 | 40.4 |  |
| VIE–LHR | 29.5 | 59.1 |  |
| VIE–AMS | 28.5 | 56.9 |  |
| VIE–CDG | 28 | 56.1 |  |
| VIE–FRA | 27 | 81.2 |  |
| VIE–PMI | 26.5 | 44.5 |  |
| VIE–HAM | 26 | 43.7 |  |
| VIE–NCE | 24 | 23.9 | no other airline known on this route |
| VIE–FCO | 24 | 39.9 |  |
| VIE–PRG | 22.5 | 22.4 | no other airline known on this route |
| VIE–DUS | 22 | 43.6 |  |
| VIE–OTP | 22 | 36.8 |  |
| VIE–WAW | 21.5 | 43.3 |  |
| VIE–SOF | 21.5 | 36.1 |  |
| VIE–BRU | 21 | 41.9 |  |
| VIE–BUD | 21 | 20.8 | no other airline known on this route |
| VIE–MUC | 20.5 | 41.2 |  |
| VIE–HAJ | 20.5 | 20.3 | no other airline known on this route |

Sum of estimated weekly departures from VIE: **1189** (34 routes without an official total).

### Fleet

| Type | Wikipedia (in service) | Austro Control register, 30 Sept 2026 | Difference |
|---|---|---|---|
| A20N | 5 | 7 | **+2** |
| A21N | 0 | 0 | ✓ |
| A320 | 29 | 29 | ✓ |
| A321 | 6 | 6 | ✓ |
| B763 | 3 | 3 | ✓ |
| B772 | 6 | 6 | ✓ |
| B789 | 3 | 4 | **+1** |
| E195 | 13 | 13 | ✓ |
| **Total** | 65 | 68 | 3 |

> The register is two months newer than the Wikipedia table (July 2026): recent deliveries appear there first.

Registrations in the register:

- A20N: OE-LXF, OE-LXG, OE-LZN, OE-LZO, OE-LZP, OE-LZQ, OE-LZR
- A320: OE-LBI, OE-LBJ, OE-LBK, OE-LBL, OE-LBM, OE-LBN, OE-LBO, OE-LBP, OE-LBQ, OE-LBR, OE-LBS, OE-LBT, OE-LBU, OE-LBV, OE-LBW, OE-LBX, OE-LBY, OE-LBZ, OE-LXA, OE-LXB, OE-LXC, OE-LXD, OE-LXE, OE-LZA, OE-LZB, OE-LZC, OE-LZD, OE-LZE, OE-LZF
- A321: OE-LBA, OE-LBB, OE-LBC, OE-LBD, OE-LBE, OE-LBF
- B763: OE-LAE, OE-LAY, OE-LAZ
- B772: OE-LPA, OE-LPB, OE-LPC, OE-LPD, OE-LPE, OE-LPF
- B789: OE-LPG, OE-LPI, OE-LPL, OE-LPM
- E195: OE-LWA, OE-LWB, OE-LWC, OE-LWD, OE-LWE, OE-LWF, OE-LWG, OE-LWH, OE-LWI, OE-LWJ, OE-LWN, OE-LWO, OE-LWP

## Lufthansa (DLH)

Hubs: FRA, MUC · Bases: 0 · Routes in our network: 311

### Destinations

Our network serves **202** airports (besides the hubs); Wikipedia's "List of Lufthansa destinations" (rev. 1381896411) lists **221** active.

- In the destination list, **missing in our network** (34): AOI, AYT, BJV, CUN, FLR, FSC, FUE, GOA, HRG, IAS, JED, KLX, KWI, LCA, LPA, LUZ, MLE, MPL, MRU, NOC, PNQ, PSA, RAK, RNS, SNN, SSH, TFS, TRN, TRS, TSR, VAR, VRN, XRY, ZTH
- In our network, but **ended** according to the list (7): GLA, GVA, HYD, NCL, NGO, NRT, RUH
- In our network, **not in the list at all** (8): BZG, CFU, JTR, KGS, OMR, PVK, RMF, TIV

### Weekly flights from FRA (estimate vs. all airlines, Eurostat S24)

| Route | Ours (estimate) | All airlines (official) | Note |
|---|---|---|---|
| FRA–HAM | 42.5 | 85.1 |  |
| FRA–MUC | 39.5 | 79.1 |  |
| FRA–LHR | 34.5 | 104.2 |  |
| FRA–DUS | 32 | 32 | no other airline known on this route |
| FRA–STR | 31.5 | 31.5 | no other airline known on this route |
| FRA–LEJ | 31 | 30.9 | no other airline known on this route |
| FRA–HAJ | 31 | 30.8 | no other airline known on this route |
| FRA–OSL | 31 | 30.8 | no other airline known on this route |
| FRA–BRE | 30.5 | 30.4 | no other airline known on this route |
| FRA–GOT | 30.5 | 30.4 | no other airline known on this route |
| FRA–BER | 30 | 89.8 |  |
| FRA–KRK | 30 | 29.9 | no other airline known on this route |
| FRA–NUE | 29 | 28.8 | no other airline known on this route |
| FRA–AMS | 29 | 77.3 |  |
| FRA–VIE | 27 | 80.7 |  |
| FRA–SZG | 26.5 | 26.6 | no other airline known on this route |
| FRA–BCN | 26 | 52.4 |  |
| FRA–NCE | 25.5 | 25.7 | no other airline known on this route |
| FRA–DRS | 25 | 25.1 | no other airline known on this route |
| FRA–BRU | 24.5 | 48.7 |  |

Sum of estimated weekly departures from FRA: **1896** (31 routes without an official total).

### Fleet

No downloadable register with operators for this airline (Germany, Hungary/Malta/UK: not available or not licensed) — Wikipedia only:

| Type | In service | On order |
|---|---|---|
| A319 | 22 | 0 |
| A320 | 44 | 0 |
| A20N | 26 | 22 |
| A321 | 52 | 0 |
| A21N | 20 | 14 |
| A333 | 6 | 0 |
| A343 | 12 | 0 |
| A359 | 31 | 10 |
| A35K | 0 | 15 |
| A388 | 8 | 0 |
| B744 | 8 | 0 |
| B748 | 17 | 0 |
| B779 | 0 | 20 |
| B789 | 20 | 16 |

Infobox fleet size: — · Sum of fleet table: 266

## Ryanair (RYR)

Hubs: STN · Bases: 135 · Routes in our network: 2653

### Destinations

Our network serves **228** airports (besides the hubs); Wikipedia's "List of Ryanair destinations" (rev. 1377386838) lists **229** active.

- In the destination list, **missing in our network** (5): AQJ, ORB, SXB, TAT, TFN
- In our network, but **ended** according to the list (4): AAL, BOD, MST, VBY
- In our network, **not in the list at all** (0): —

### Weekly flights from STN (estimate vs. all airlines, Eurostat S24)

| Route | Ours (estimate) | All airlines (official) | Note |
|---|---|---|---|
| STN–DUB | 56.5 | 56.6 | no other airline known on this route |
| STN–CIA | 30.5 | 30.5 | no other airline known on this route |
| STN–BCN | 28 | 27.9 | no other airline known on this route |
| STN–BUD | 28 | 28 | no other airline known on this route |
| STN–BGY | 26.5 | 26.7 | no other airline known on this route |
| STN–BER | 24 | 23.9 | no other airline known on this route |
| STN–PMI | 24 | 40 |  |
| STN–OTP | 23.5 | 23.6 | no other airline known on this route |
| STN–LIS | 23 | 22.9 | no other airline known on this route |
| STN–MAD | 21.5 | 21.4 | no other airline known on this route |
| STN–EIN | 21 | 20.9 | no other airline known on this route |
| STN–CPH | 21 | 20.8 | no other airline known on this route |
| STN–PSA | 20.5 | 20.6 | no other airline known on this route |
| STN–ORK | 20 | 20 | no other airline known on this route |
| STN–ALC | 19 | 31.3 |  |
| STN–VCE | 19 | 18.9 | no other airline known on this route |
| STN–OPO | 18.5 | 18.6 | no other airline known on this route |
| STN–SOF | 18 | 17.9 | no other airline known on this route |
| STN–WMI | 17.5 | 17.6 | no other airline known on this route |
| STN–MXP | 17.5 | 17.5 | no other airline known on this route |

Sum of estimated weekly departures from STN: **1225** (36 routes without an official total).

### Fleet

| Type | Wikipedia (in service) | Irish Aviation Authority register, 30 Sept 2025 | Difference |
|---|---|---|---|
| ? BOEING 737-8200 LAND AEROPLANE | 0 | 135 | **+135** |
| A320 | 26 | 0 | **-26** |
| B38M | 210 | 0 | **-210** |
| B3XM | 0 | 0 | ✓ |
| B737 | 1 | 0 | **-1** |
| B738 | 410 | 205 | **-205** |
| **Total** | 647 | 340 | -307 |

> Wikipedia counts the whole Ryanair group; the Irish register only holds Ryanair DAC (EI-). Buzz (SP-), Malta Air and Lauda Europe (9H-) and Ryanair UK (G-) are registered in other countries, so the register is expected to show fewer aircraft.

Registrations in the register:

- ? BOEING 737-8200 LAND AEROPLANE: EI-HAT, EI-HAW, EI-HAX, EI-HAY, EI-HEN, EI-HES, EI-HET, EI-HEV, EI-HEW, EI-HEY, EI-HEZ, EI-HGE, EI-HGF, EI-HGG, EI-HGH, EI-HGL, EI-HGM, EI-HGN, EI-HGO, EI-HGP, EI-HGR, EI-HGS, EI-HGT, EI-HGV, EI-HGW, EI-HGX, EI-HGY, EI-HGZ, EI-HMS, EI-HMT, EI-HMV, EI-HMW, EI-HMX, EI-HMY, EI-HMZ, EI-IFP, EI-IFR, EI-IFS, EI-IFT, EI-IFV, EI-IFW, EI-IFX, EI-IFY, EI-IFZ, EI-IGE, EI-IGF, EI-IGG, EI-IGH, EI-IGI, EI-IGJ, EI-IGK, EI-IGL, EI-IGM, EI-IGO, EI-IGV, EI-IGW, EI-IGX, EI-IGY, EI-IGZ, EI-IHA, EI-IHB, EI-IHC, EI-IHE, EI-IHF, EI-IHG, EI-IHI, EI-IHJ, EI-IHK, EI-IHM, EI-IHN, EI-IHO, EI-IHP, EI-IHR, EI-IHS, EI-IHT, EI-IHV, EI-IHW, EI-IHX, EI-IHY, EI-IHZ, EI-IJA, EI-IJB, EI-IJC, EI-IJD, EI-IJE, EI-IJF, EI-IJG, EI-IJH, EI-IJI, EI-IJJ, EI-IJK, EI-IJL, EI-IJM, EI-IJN, EI-IJO, EI-IJP, EI-IJR, EI-IJS, EI-IJT, EI-IJV, EI-IJW, EI-IJX, EI-IJY, EI-IJZ, EI-IKA, EI-IKC, EI-IKD, EI-IKE, EI-IKH, EI-IKI, EI-IKJ, EI-IKK, EI-IKM, EI-IKN, EI-IKO, EI-IKP, EI-IKR, EI-IKS, EI-IKT, EI-IKV, EI-IKW, EI-IKX, EI-IKY, EI-IKZ, EI-ILA, EI-ILB, EI-ILC, EI-ILD, EI-ILE, EI-ILF, EI-ILG, EI-ILH, EI-ILJ, EI-ILM, EI-ILN
- B738: EI-DCJ, EI-DCK, EI-DCL, EI-DCM, EI-DCN, EI-DCO, EI-DCP, EI-DCR, EI-DCW, EI-DCX, EI-DCY, EI-DCZ, EI-DHA, EI-DHC, EI-DHD, EI-DHE, EI-DHF, EI-DHG, EI-DHH, EI-DHN, EI-DHO, EI-DHR, EI-DHX, EI-DHZ, EI-DLB, EI-DLC, EI-DLD, EI-DLF, EI-DLI, EI-DLV, EI-DLW, EI-DLX, EI-DLY, EI-DPF, EI-DPH, EI-DPI, EI-DPJ, EI-DPK, EI-DPL, EI-DPN, EI-DPP, EI-DPR, EI-DPV, EI-DPY, EI-DPZ, EI-DWA, EI-DWC, EI-DWD, EI-DWE, EI-DWF, EI-DWG, EI-DWH, EI-DWK, EI-DWM, EI-DWO, EI-DWP, EI-DWR, EI-DWS, EI-DWT, EI-DWV, EI-DWW, EI-DWX, EI-DWY, EI-DYA, EI-DYC, EI-DYD, EI-DYE, EI-DYL, EI-DYO, EI-DYR, EI-DYV, EI-DYW, EI-DYX, EI-DYY, EI-EBC, EI-EBD, EI-EBE, EI-EBF, EI-EBG, EI-EBK, EI-EBL, EI-EBN, EI-EBO, EI-EBP, EI-EBR, EI-EBS, EI-EBV, EI-EBW, EI-EBX, EI-EBY, EI-EBZ, EI-EFC, EI-EFD, EI-EFE, EI-EFF, EI-EFG, EI-EFH, EI-EFI, EI-EFJ, EI-EFK, EI-EFN, EI-EFO, EI-EFX, EI-EFY, EI-EFZ, EI-EGA, EI-EGB, EI-EGC, EI-EGD, EI-EKC, EI-EKD, EI-EKF, EI-EKG, EI-EKH, EI-EKI, EI-EKJ, EI-EKK, EI-EKL, EI-EKM, EI-EKN, EI-EKO, EI-EKP, EI-EKR, EI-EKS, EI-EKT, EI-EKV, EI-EKW, EI-EKX, EI-EKY, EI-EMA, EI-EMB, EI-EMC, EI-EMD, EI-EME, EI-EMF, EI-EMH, EI-EMI, EI-EMJ, EI-EMK, EI-EML, EI-EMM, EI-EMN, EI-EMO, EI-ENA, EI-ENC, EI-ENE, EI-ENF, EI-ENG, EI-ENH, EI-ENI, EI-ENJ, EI-ENK, EI-ENL, EI-ENM, EI-ENN, EI-ENO, EI-ENP, EI-ENR, EI-ENT, EI-ENV, EI-ENW, EI-EPB, EI-EPC, EI-EPD, EI-ESS, EI-EST, EI-ESV, EI-EVA, EI-EVB, EI-EVC, EI-EVE, EI-EVF, EI-EVG, EI-EVH, EI-EVI, EI-EVJ, EI-EVK, EI-EVL, EI-EVM, EI-EVN, EI-EVO, EI-EVP, EI-EVR, EI-EVS, EI-EVT, EI-EVV, EI-EVX, EI-EXD, EI-EXE, EI-EXF, EI-GJS, EI-GJT, EI-GSG, EI-GSH, EI-GSI, EI-GSJ, EI-GSK, EI-GXG, EI-GXH, EI-GXI, EI-GXJ, EI-GXK, EI-GXL, EI-GXM, EI-GXN

## Wizz Air (WZZ)

Hubs: BUD · Bases: 80 · Routes in our network: 1142

### Destinations

Our network serves **185** airports (besides the hubs); Wikipedia's "List of Wizz Air destinations" (rev. 1381664317) lists **178** active.

- In the destination list, **missing in our network** (8): ACE, ALF, BRE, GRO, KGS, LCJ, LEJ, MED
- In our network, but **ended** according to the list (2): ESB, VIE
- In our network, **not in the list at all** (13): BIO, EFL, GRX, JSI, KLX, LEI, OMR, OVD, PFO, RJK, RMI, SCQ, ZAD

### Weekly flights from BUD (estimate vs. all airlines, Eurostat S24)

| Route | Ours (estimate) | All airlines (official) | Note |
|---|---|---|---|
| BUD–LTN | 21 | 21.2 | no other airline known on this route |
| BUD–WAW | 16.5 | 33 |  |
| BUD–MXP | 15.5 | 25.8 |  |
| BUD–IST | 15.5 | 30.6 |  |
| BUD–BCN | 13.5 | 23.7 |  |
| BUD–BER | 12 | 20 |  |
| BUD–FCO | 12 | 11.9 | no other airline known on this route |
| BUD–EIN | 11 | 10.9 | no other airline known on this route |
| BUD–CRL | 10.5 | 17.7 |  |
| BUD–STR | 9 | 14.9 |  |
| BUD–BSL | 8.5 | 20.2 |  |
| BUD–LCA | 7.5 | 7.3 | no other airline known on this route |
| BUD–MAD | 7.5 | 19.5 |  |
| BUD–NCE | 7 | 7.2 | no other airline known on this route |
| BUD–NAP | 7 | 11.6 |  |
| BUD–AYT | 7 | 21 | seasonal |
| BUD–BRI | 6.5 | 11.2 |  |
| BUD–TLV | 6.5 | 30.4 |  |
| BUD–MLA | 6.5 | 11.1 |  |
| BUD–LGW | 6 | 11.7 |  |

Sum of estimated weekly departures from BUD: **332** (31 routes without an official total).

### Fleet

No downloadable register with operators for this airline (Germany, Hungary/Malta/UK: not available or not licensed) — Wikipedia only:

| Type | In service | On order |
|---|---|---|
| A320 | 12 | 0 |
| A321 | 35 | 0 |
| A21N | 71 | 265 |

Infobox fleet size: 118 · Sum of fleet table: 118

