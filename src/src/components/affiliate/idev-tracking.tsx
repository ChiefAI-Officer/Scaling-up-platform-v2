"use client";

import Script from "next/script";

interface IdevTrackingProps {
  scriptUrl: string;
  saleAmount: string;
  orderNumber: string;
  productCode: string;
  customerEmail: string;
  currency: string;
}

export function IdevTracking({
  scriptUrl,
  saleAmount,
  orderNumber,
  productCode,
  customerEmail,
  currency,
}: IdevTrackingProps) {
  const varsScriptId = `idev-vars-${orderNumber}`;
  const remoteScriptId = `idev-script-${orderNumber}`;

  return (
    <>
      <Script id={varsScriptId} strategy="afterInteractive">
        {`
          window.idev_saleamt = ${JSON.stringify(saleAmount)};
          window.idev_ordernum = ${JSON.stringify(orderNumber)};
          window.idev_productcode = ${JSON.stringify(productCode)};
          window.idev_customer_email = ${JSON.stringify(customerEmail)};
          window.idev_currency = ${JSON.stringify(currency.toUpperCase())};

          var idev_saleamt = window.idev_saleamt;
          var idev_ordernum = window.idev_ordernum;
          var idev_productcode = window.idev_productcode;
          var idev_customer_email = window.idev_customer_email;
          var idev_currency = window.idev_currency;
        `}
      </Script>
      <Script id={remoteScriptId} src={scriptUrl} strategy="afterInteractive" />
    </>
  );
}
