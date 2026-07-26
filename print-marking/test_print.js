// test_print.js
const { exec } = require('child_process');

// !!! LƯU Ý: Thay 'Zebra_GK420t' bang dung ten may in cua ban hien thi tu lenh 'lpstat -p -d'
const PRINTER_NAME = 'Zebra_Technologies_ZTC_GK420t'; 

/**
 * Thiet ke chuoi ma vach 1D (ZPL) toi uu cho kho tem nho:
 * ^BY2,3,60   -> Do rong vach la 2 (rat manh, hop tem nho), chieu cao vach 60 dots.
 * ^FO20,20    -> Toa do goc in sat viền (X=20, Y=20 dots) de tranh bi mat thong tin.
 * ^BCN,60,Y   -> Ma vach Code 128, chieu cao 60, hien thi text o duoi (Y).
 */
const zplBarcode = `
^XA
^BY2,3,60
^FO20,20
^BCN,60,Y,N,N
^FD123456789
^FS
^XZ
`.trim();

console.log(`Dang gui lenh in Barcode den may in: ${PRINTER_NAME}...`);

// Su dung lenh 'lp' voi option '-o raw' de gui truc tiep code ZPL vào máy in qua CUPS
const printProcess = exec(`lp -d ${PRINTER_NAME} -o raw`, (error, stdout, stderr) => {
    if (error) {
        console.error(`Loi khi goi lenh lp: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`Thong tin log he thong: ${stderr}`);
        return;
    }
    console.log(`Ket qua thuc thi: ${stdout}`);
    console.log('Lenh in da duoc gui thanh cong! Hay kiem tra may in.');
});

// Ghi chuoi ma vach vao luong Standard Input cua terminal
printProcess.stdin.write(zplBarcode);
printProcess.stdin.end();