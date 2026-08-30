import type { CriterionDefinition, DimensionName, StandardId } from './types.js';

const criterion = (
  standard: StandardId,
  dimension: DimensionName,
  field: string,
  question: string
): CriterionDefinition => ({
  id: `${standard}.${field.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`,
  standard,
  dimension,
  field,
  question
});

export const CRITERIA: CriterionDefinition[] = [
  criterion('darwin-core', 'Interpretabilidade', 'dwc:scientificName', 'O nome científico da espécie está preenchido?'),
  criterion('darwin-core', 'Interpretabilidade', 'dwc:kingdom', 'O Reino biológico foi informado?'),
  criterion('darwin-core', 'Interpretabilidade', 'dwc:family', 'A Família biológica foi informada?'),
  criterion('darwin-core', 'Interpretabilidade', 'dwc:taxonRank', 'O nível taxonômico está definido?'),
  criterion('darwin-core', 'Reputação', 'dwc:identifiedBy', 'O nome do especialista que identificou a espécie está presente?'),
  criterion('darwin-core', 'Reputação', 'dwc:dateIdentified', 'A data em que a identificação foi feita está registrada?'),
  criterion('darwin-core', 'Reputação', 'dwc:basisOfRecord', 'O tipo de registro usa o termo oficial?'),
  criterion('darwin-core', 'Reputação', 'dwc:occurrenceStatus', 'O status usa o termo oficial do vocabulário?'),
  criterion('darwin-core', 'Acurácia', 'dwc:decimalLatitude', 'A latitude está informada em formato decimal válido?'),
  criterion('darwin-core', 'Acurácia', 'dwc:decimalLongitude', 'A longitude está informada em formato decimal válido?'),
  criterion('darwin-core', 'Acurácia', 'dwc:geodeticDatum', 'O sistema de referência espacial foi informado?'),
  criterion('darwin-core', 'Temporalidade', 'dwc:eventDate', 'A data da coleta segue o padrão ISO 8601?'),
  criterion('darwin-core', 'Temporalidade', 'dwc:samplingProtocol', 'O método ou protocolo usado na coleta foi descrito?'),
  criterion('darwin-core', 'Completude', 'dwc:measurementValue', 'O valor numérico da medição está preenchido?'),
  criterion('darwin-core', 'Completude', 'dwc:measurementUnit', 'A unidade de medida foi informada?'),
  criterion('darwin-core', 'Acessibilidade', 'dwc:occurrenceID', 'O registro possui um código de identificação único?'),
  criterion('darwin-core', 'Acessibilidade', 'dwc:datasetID', 'O conjunto de dados possui um código de identificação?'),
  criterion('darwin-core', 'Consistência', 'dwc:language', 'O código do idioma segue o padrão ISO 639?'),
  criterion('darwin-core', 'Consistência', 'dwc:countryCode', 'O código do país segue o padrão ISO 3166?'),
  criterion('darwin-core', 'Segurança de Acesso', 'dwc:accessRights', 'As informações sobre direitos de uso estão descritas?'),
  criterion('darwin-core', 'Acurácia', 'dwc:coordinateUncertaintyInMeters', 'A margem de erro da coordenada foi informada?'),
  criterion('darwin-core', 'Acurácia', 'dwc:taxonomicStatus', 'O status do nome científico está informado?'),
  criterion('darwin-core', 'Reputação', 'dwc:institutionCode', 'O código da instituição custodiadora está preenchido?'),
  criterion('darwin-core', 'Acessibilidade', 'dwc:license', 'Existe uma licença de uso padrão definida?'),
  criterion('darwin-core', 'Temporalidade', 'dwc:modified', 'A data da última modificação do registro foi informada?'),
  criterion('darwin-core', 'Completude', 'dwc:sex', 'O sexo do espécime ou organismo foi informado?'),
  criterion('darwin-core', 'Completude', 'dwc:lifeStage', 'O estágio de vida foi informado?'),

  criterion('wcmp-2', 'Temporalidade', 'properties.extent.temporal', 'O intervalo de tempo está em conformidade com a ISO 8601?'),
  criterion('wcmp-2', 'Interpretabilidade', 'properties.themes', 'As palavras-chave vêm de um vocabulário oficial da WMO?'),
  criterion('wcmp-2', 'Reputação', 'properties.contacts', 'A instituição ou pessoa responsável pelo dado está identificada?'),
  criterion('wcmp-2', 'Reputação', 'properties.license', 'A licença de uso do dado meteorológico está informada?'),
  criterion('wcmp-2', 'Acessibilidade', 'links', 'Existe um link absoluto válido para acesso ao dado?'),
  criterion('wcmp-2', 'Acurácia', 'geometry', 'A geometria GeoJSON da coleta está correta?'),
  criterion('wcmp-2', 'Completude', 'id', 'O identificador único do registro meteorológico está presente?'),
  criterion('wcmp-2', 'Completude', 'type', 'O tipo de recurso está definido conforme o padrão?'),
  criterion('wcmp-2', 'Completude', 'properties', 'As propriedades básicas obrigatórias estão preenchidas?'),
  criterion('wcmp-2', 'Consistência', 'version', 'A versão do padrão WCMP está indicada?'),
  criterion('wcmp-2', 'Segurança de Acesso', 'properties.accessConstraints', 'As regras de acesso estão descritas?'),
  criterion('wcmp-2', 'Acessibilidade', 'properties.wmo:dataPolicy', 'A política de dados da WMO está definida conforme a lista controlada?'),
  criterion('wcmp-2', 'Acurácia', 'properties.wmo:topicHierarchy', 'O dado usa a hierarquia de tópicos oficial da WMO?'),
  criterion('wcmp-2', 'Interpretabilidade', 'language', 'O idioma do metadado está definido como inglês?'),
  criterion('wcmp-2', 'Consistência', 'properties.created', 'A data de criação do registro foi informada?'),
  criterion('wcmp-2', 'Temporalidade', 'properties.pubtime', 'A data ou hora de publicação está presente e válida?'),
  criterion('wcmp-2', 'Completude', 'properties.contacts (role)', "Existe contato com papel de 'originator' ou 'custodian'?"),

  criterion('iso-19115', 'Interpretabilidade', 'abstract', 'Existe um resumo descrevendo o conteúdo do dado?'),
  criterion('iso-19115', 'Interpretabilidade', 'purpose', 'O objetivo da criação do dado está claro?'),
  criterion('iso-19115', 'Acurácia', 'referenceSystemIdentifier', 'O código oficial do sistema de referência EPSG foi informado?'),
  criterion('iso-19115', 'Reputação', 'lineage', 'O histórico de criação e processamento está documentado?'),
  criterion('iso-19115', 'Acessibilidade', 'MD_Constraints', 'As restrições de uso ou limitações estão informadas?'),
  criterion('iso-19115', 'Completude', 'title', 'O título do recurso de dados está preenchido?'),
  criterion('iso-19115', 'Completude', 'date', 'A data de criação do metadado está presente?'),
  criterion('iso-19115', 'Completude', 'language', 'O idioma do metadado foi informado?'),
  criterion('iso-19115', 'Completude', 'topicCategory', 'A categoria principal do tema foi informada?'),
  criterion('iso-19115', 'Consistência', 'MD_TopicCategoryCode', 'A categoria pertence à lista oficial de códigos da ISO?'),
  criterion('iso-19115', 'Temporalidade', 'CI_Date', 'Existe uma data para a última revisão ou atualização?'),
  criterion('iso-19115', 'Segurança de Acesso', 'MD_SecurityConstraints', 'O nível de sigilo ou segurança está definido?'),
  criterion('iso-19115', 'Acurácia', 'spatialResolution', 'A resolução espacial foi informada?'),
  criterion('iso-19115', 'Acessibilidade', 'distributionFormat', 'O formato digital do arquivo está descrito?'),
  criterion('iso-19115', 'Temporalidade', 'maintenanceAndUpdateFrequency', 'A frequência de atualização está definida?'),
  criterion('iso-19115', 'Reputação', 'role (CI_RoleCode)', 'O papel do contato está definido na lista controlada?'),
  criterion('iso-19115', 'Interpretabilidade', 'characterSet (defaultLocale)', 'A codificação UTF-8 está declarada?')
];

export const criteriaFor = (standard: StandardId): CriterionDefinition[] =>
  CRITERIA.filter((item) => item.standard === standard);
