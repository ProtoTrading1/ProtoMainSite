import { useCallback, useEffect, useState } from 'react';
import { buildAddressLine, buildDeliveryAddressLine } from '../lib/addressUtils';

export function useBillingDeliveryAddresses({ setProvince, setCountry } = {}) {
  const [billingStreet, setBillingStreet] = useState('');
  const [billingSuburb, setBillingSuburb] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [deliverySameAsBilling, setDeliverySameAsBilling] = useState(false);
  const [streetName, setStreetName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [otherBuildingType, setOtherBuildingType] = useState('');

  const applyBillingToDelivery = useCallback((parts) => {
    setStreetName(parts.street || '');
    setSuburb(parts.suburb || '');
    setCity(parts.city || '');
    setPostalCode(parts.postalCode || '');
  }, []);

  const getBillingParts = useCallback(() => ({
    street: billingStreet,
    suburb: billingSuburb,
    city: billingCity,
    postalCode: billingPostalCode,
  }), [billingStreet, billingSuburb, billingCity, billingPostalCode]);

  const onBillingPlaceSelect = useCallback((parts) => {
    setBillingStreet(parts.street || '');
    setBillingSuburb(parts.suburb || '');
    setBillingCity(parts.city || '');
    setBillingPostalCode(parts.postalCode || '');
    if (setProvince && parts.province) setProvince(parts.province);
    if (setCountry && parts.province) setCountry('South Africa');
    if (deliverySameAsBilling) applyBillingToDelivery(parts);
  }, [applyBillingToDelivery, deliverySameAsBilling, setCountry, setProvince]);

  const handleDeliverySameAsBillingChange = useCallback((checked) => {
    setDeliverySameAsBilling(checked);
    if (checked) applyBillingToDelivery(getBillingParts());
  }, [applyBillingToDelivery, getBillingParts]);

  useEffect(() => {
    if (!deliverySameAsBilling) return;
    applyBillingToDelivery(getBillingParts());
  }, [applyBillingToDelivery, deliverySameAsBilling, getBillingParts]);

  const buildStructuredBillingAddress = useCallback(() => (
    buildAddressLine({
      streetName: billingStreet,
      suburb: billingSuburb,
      city: billingCity,
      postalCode: billingPostalCode,
    })
  ), [billingStreet, billingSuburb, billingCity, billingPostalCode]);

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
    billingStreet,
    billingSuburb,
    billingCity,
    billingPostalCode,
    setBillingStreet,
    setBillingSuburb,
    setBillingCity,
    setBillingPostalCode,
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
    onBillingPlaceSelect,
    handleDeliverySameAsBillingChange,
    resolvedBuildingType,
    buildStructuredBillingAddress,
    buildStructuredDeliveryAddress,
    deliveryFieldsLocked: deliverySameAsBilling,
  };
}
