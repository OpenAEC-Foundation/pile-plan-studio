import { useTranslation } from "react-i18next";
import { Button, Heading, InfoCard } from "../../../openaec/react/src/index";
import { PRODUCT_INFO } from "../../../productInfo";

export default function AboutPanel({ hideLinks = false }: { hideLinks?: boolean }){
  const {t}=useTranslation("backstage");
  const openExternal=async(url:string)=>{
    try{const {openUrl}=await import("@tauri-apps/plugin-opener");await openUrl(url);}
    catch{window.open(url,"_blank","noopener,noreferrer");}
  };
  return <section className="bs-about-panel" aria-label={t("aboutPanel.title")}>
    <header className="bs-about-heading">
      <img src={`${import.meta.env.BASE_URL}pile-plan-studio-icon.png`} width="48" height="48" alt=""/>
      <Heading level="page">{t("aboutPanel.title")}</Heading>
    </header>
    <p className="bs-about-tagline">{t("aboutPanel.tagline")}</p>
    <p>{t("aboutPanel.description")}</p>
    <InfoCard title={PRODUCT_INFO.name} facts={[
      [t("aboutPanel.version"),`${PRODUCT_INFO.version} · ${PRODUCT_INFO.status}`],
      [t("aboutPanel.license"),PRODUCT_INFO.license],
    ]}/>
    <section className="bs-about-company">
      <Heading level="panel">{PRODUCT_INFO.organization}</Heading>
      <p>{t("aboutPanel.companyDescription")}</p>
      <p className="oa-secondary">{t("aboutPanel.stichting")}</p>
    </section>
    {!hideLinks && <div className="bs-about-links">
      <Button onClick={()=>void openExternal("https://www.open-aec.com/")}>{t("aboutPanel.website")}</Button>
      <Button onClick={()=>void openExternal("https://github.com/OpenAEC-Foundation")}>{t("aboutPanel.github")}</Button>
    </div>}
    <p className="bs-about-copyright oa-secondary">{t("aboutPanel.copyright",{license:PRODUCT_INFO.license})}</p>
  </section>;
}
