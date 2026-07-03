import { useCallback, useState } from 'react';
import { EMPTY_BILLING_PARTS, buildDeliveryAddressLine } from '../lib/addressUtils';

export function useBillingDeliveryAddresses({ setProvince, setCountry } = {}) {
  const [companyAddress, setCompanyAddress] = useState('');
  const [billingParts, setBillingParts] = useState(EMPTY_BILLING_PARTS);
  const [deliverySameAsBilling, setDeliverySameAsBilling] = useState(false);
  const [streetName, setStreetName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [otherBuildingType, setOtherBuildingType] = useState('');

  const applyBillingToDelivery = useCallback((parts) => {
    if (!parts) return;
    setStreetName(parts.street || '');
    setSuburb(parts.suburb || '');
    setCity(parts.city || '');
    setPostalCode(parts.postalCode || '');
  }, []);

  const handleCompanyAddressChange = useCallback((value) => {
    setCompanyAddress(value);
  }, []);

  const onBillingPlaceSelect = useCallback((parts) => {
    setBillingParts(parts);
    setCompanyAddress(parts.formatted || '');
    if (setProvince && parts.province) setProvince(parts.province);
    if (setCountry && parts.province) setCountry('South Africa');
    if (parts.city) setCity((prev) => prev || parts.city);
    if (deliverySameAsBilling) applyBillingToDelivery(parts);
  }, [applyBillingToDelivery, deliverySameAsBilling, setCountry, setProvince]);

  const handleDeliverySameAsBillingChange = useCallback((checked) => {
    setDeliverySameAsBilling(checked);
    if (checked) applyBillingToDelivery(billingParts);
  }, [applyBillingToDelivery, billingParts]);

  const resolvedBuildingType = useCallback(() => (
    buildingType === 'Other' ? otherBuildingType.trim() : buildingType
  ), [buildingType, otherBuildingType]);

  const buildStructuredDeliveryAddress = useCallback(() => (
    buildDeliveryAddressLine({
      streetName,
      suburb,
      city,
      postalCode,
      buildingType,
      buildingTypeOther: otherBuildingType,
      unitNumber,
      isApartments: buildingType === 'Apartments',
      isOtherBuilding: buildingType === 'Other',
    })
  ), [streetName, suburb, city, postalCode, buildingType, otherBuildingType, unitNumber]);

  return {
    companyAddress,
    billingParts,
    deliverySameAsBilling,
    streetName,
    suburb,
    postalCode,
    city,
    buildingType,
    unitNumber,
    otherBuildingType,
    setStreetName,
    setSuburb,
    setPostalCode,
    setCity,
    setBuildingType,
    setUnitNumber,
    setOtherBuildingType,
    handleCompanyAddressChange,
    onBillingPlaceSelect,
    handleDeliverySameAsBillingChange,
    resolvedBuildingType,
    buildStructuredDeliveryAddress,
    deliveryFieldsLocked: deliverySameAsBilling,
  };
}
